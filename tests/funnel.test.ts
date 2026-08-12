// First-party funnel analytics (spec 38): the shared contract, the browser beacon's
// once-per-session guard, the Worker's strict ingest, and the operator dashboard read.
// Plus the safety net that keeps the beacon out of published artist sites.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../oauth-proxy/worker.js';
import { signJwt } from '../oauth-proxy/lib/jwt.js';
import {
	DIRECT_REF,
	FUNNEL_STEPS,
	funnelRefFromParams,
	isFunnelStep,
	sanitizeFunnelRef,
} from '../oauth-proxy/lib/funnel-contract.js';
import { funnelRefFor, reportFunnelStep, type FunnelEnvironment } from '../src/lib/funnel';
import { parseAndMigrateContent } from '../src/lib/content';
import { blankContent } from '../src/editor/lib/content-init';
import type { PortfolioBundle } from '../src/editor/lib/exporter';
import { generateStaticSite } from '../src/editor/lib/staticgen/site';

const ORIGIN = 'https://hangwork.art';

class MemoryKv {
	values = new Map<string, string>();

	async get(key: string, type?: string) {
		const value = this.values.get(key) ?? null;
		return type === 'json' && value ? JSON.parse(value) : value;
	}

	async put(key: string, value: string) {
		this.values.set(key, value);
	}
}

function testEnvironment(): FunnelEnvironment & { sent: string[]; store: Map<string, string> } {
	const store = new Map<string, string>();
	const sent: string[] = [];
	return {
		store,
		sent,
		storage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
		},
		search: '',
		send: (body: string) => void sent.push(body),
	};
}

describe('funnel contract', () => {
	it('sanitizes attribution tags the way the serving Worker sanitizes page names', () => {
		expect(sanitizeFunnelRef('TT-Video-3')).toBe('tt-video-3');
		expect(sanitizeFunnelRef('insta story/reel 4')).toBe('insta-story/reel-4');
		expect(sanitizeFunnelRef('ref_with_underscores')).toBe('ref_with_underscores');
		// Junk, empty, and non-string tags all land in one honest bucket.
		expect(sanitizeFunnelRef('')).toBe(DIRECT_REF);
		expect(sanitizeFunnelRef('  ')).toBe(DIRECT_REF);
		expect(sanitizeFunnelRef('***')).toBe(DIRECT_REF);
		expect(sanitizeFunnelRef(null)).toBe(DIRECT_REF);
		expect(sanitizeFunnelRef(42)).toBe(DIRECT_REF);
		// Length-capped so no single tag can bloat the monthly aggregate.
		expect(sanitizeFunnelRef('a'.repeat(400))).toHaveLength(64);
		// No HTML, quotes or path traversal survives into a KV key.
		expect(sanitizeFunnelRef('<script>alert(1)</script>')).toBe('script-alert-1-/script');
	});

	it('prefers ?ref=, falls back to utm_source(+utm_content), then direct', () => {
		expect(funnelRefFromParams(new URLSearchParams('?ref=tt-video-3'))).toBe('tt-video-3');
		expect(funnelRefFromParams(new URLSearchParams('?utm_source=Instagram'))).toBe('instagram');
		expect(funnelRefFromParams(new URLSearchParams('?utm_source=ig&utm_content=post7'))).toBe('ig/post7');
		// A ref present but unusable falls through to the utm pair rather than winning.
		expect(funnelRefFromParams(new URLSearchParams('?ref=!!!&utm_source=tiktok'))).toBe('tiktok');
		expect(funnelRefFromParams(new URLSearchParams(''))).toBe(DIRECT_REF);
	});

	it('keeps the step enum closed', () => {
		expect(FUNNEL_STEPS).toEqual(['landing', 'editor', 'intake', 'signin', 'publish', 'paywall', 'checkout']);
		for (const step of FUNNEL_STEPS) expect(isFunnelStep(step)).toBe(true);
		for (const value of ['purchase', 'LANDING', '', 'landing ', null, 7, {}])
			expect(isFunnelStep(value)).toBe(false);
	});
});

describe('funnel beacon', () => {
	it('counts each step once per tab session', () => {
		const environment = testEnvironment();
		expect(reportFunnelStep('landing', environment)).toBe(true);
		expect(reportFunnelStep('landing', environment)).toBe(false);
		expect(reportFunnelStep('editor', environment)).toBe(true);
		expect(environment.sent.map((body) => JSON.parse(body).step)).toEqual(['landing', 'editor']);
	});

	it('refuses an unknown step without touching the session guard', () => {
		const environment = testEnvironment();
		expect(reportFunnelStep('purchase' as never, environment)).toBe(false);
		expect(environment.sent).toEqual([]);
		expect(environment.store.size).toBe(0);
	});

	it('makes the URL tag sticky for the rest of the tab session', () => {
		const first = { ...testEnvironment(), search: '?ref=TT-Video-3' };
		expect(reportFunnelStep('landing', first)).toBe(true);
		expect(JSON.parse(first.sent[0]).ref).toBe('tt-video-3');

		// A later page load in the same tab carries no tag — the stored one still applies.
		const later: FunnelEnvironment & { sent: string[] } = {
			sent: [],
			storage: first.storage,
			search: '',
			send(body: string) {
				this.sent.push(body);
			},
		};
		expect(reportFunnelStep('editor', later)).toBe(true);
		expect(JSON.parse(later.sent[0]).ref).toBe('tt-video-3');
	});

	it('falls back to direct with no tag, and survives storage being unavailable', () => {
		const environment = testEnvironment();
		expect(funnelRefFor(environment)).toBe(DIRECT_REF);

		const blocked: FunnelEnvironment & { sent: string[] } = {
			sent: [],
			storage: {
				getItem: () => {
					throw new Error('storage blocked');
				},
				setItem: () => {
					throw new Error('storage blocked');
				},
			},
			search: '?ref=news',
			send(body: string) {
				this.sent.push(body);
			},
		};
		// Private mode: no guard is possible, but the page must not break.
		expect(reportFunnelStep('landing', blocked)).toBe(true);
		expect(JSON.parse(blocked.sent[0]).ref).toBe('news');
	});
});

describe('funnel ingest', () => {
	const env = () => ({ KV: new MemoryKv(), ALLOWED_ORIGIN: ORIGIN });
	const post = (body: unknown, origin = ORIGIN) =>
		new Request('https://api.hangwork.art/funnel/event', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: origin },
			body: JSON.stringify(body),
		});

	it('aggregates counts per step per tag in one monthly KV value', async () => {
		const bindings = env();
		expect((await worker.fetch(post({ step: 'landing', ref: 'tt-video-3' }), bindings)).status).toBe(204);
		await worker.fetch(post({ step: 'landing', ref: 'TT-Video-3' }), bindings);
		await worker.fetch(post({ step: 'landing' }), bindings);
		await worker.fetch(post({ step: 'editor', ref: 'tt-video-3' }), bindings);

		const period = new Date().toISOString().slice(0, 7);
		const stored = await bindings.KV.get(`funnel:${period}`, 'json');
		expect(stored.steps).toEqual({
			landing: { 'tt-video-3': 2, direct: 1 },
			editor: { 'tt-video-3': 1 },
		});
	});

	it('rejects unknown steps, junk bodies, oversized payloads and foreign origins', async () => {
		const bindings = env();
		expect((await worker.fetch(post({ step: 'purchase' }), bindings)).status).toBe(400);
		expect((await worker.fetch(post({ step: 'landing' }, 'https://evil.example'), bindings)).status).toBe(403);
		expect(
			(
				await worker.fetch(
					new Request('https://api.hangwork.art/funnel/event', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
						body: 'not json',
					}),
					bindings,
				)
			).status,
		).toBe(400);
		expect((await worker.fetch(post({ step: 'landing', ref: 'x'.repeat(4000) }), bindings)).status).toBe(413);
		// Nothing invalid reached KV.
		expect(bindings.KV.values.size).toBe(0);
	});

	it('stores counts only — no identity, address or user agent', async () => {
		const bindings = env();
		await worker.fetch(
			new Request('https://api.hangwork.art/funnel/event', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ORIGIN,
					'User-Agent': 'Mozilla/5.0 (test)',
					'CF-Connecting-IP': '203.0.113.7',
					Referer: 'https://www.tiktok.com/@someone/video/123',
				},
				body: JSON.stringify({ step: 'landing', ref: 'tt', email: 'artist@example.com', ip: '203.0.113.7' }),
			}),
			bindings,
		);
		const raw = [...bindings.KV.values.values()].join('');
		for (const trace of ['Mozilla', '203.0.113.7', 'artist@example.com', 'tiktok.com'])
			expect(raw).not.toContain(trace);
	});
});

describe('funnel dashboard', () => {
	const SECRET = 'funnel-console-test-secret';
	const operator = { id: 'user-ops', email: 'ops@hangwork.art', google_sub: null };

	/** Answers the two queries GET /admin/funnel makes: the session user, and the
	 *  per-month purchase count from the Polar ledger. */
	const fakeDb = (purchases: { period: string; purchases: number }[]) => ({
		prepare(sql: string) {
			const statement = {
				bind: () => statement,
				first: async () => (sql.includes('FROM users WHERE id = ?') ? operator : null),
				all: async () => ({ results: sql.includes('admin-funnel-purchases') ? purchases : [] }),
			};
			return statement;
		},
	});

	const adminEnv = (kv: MemoryKv, purchases: { period: string; purchases: number }[] = []) => ({
		KV: kv,
		ALLOWED_ORIGIN: ORIGIN,
		SESSION_SECRET: SECRET,
		ADMIN_EMAILS: 'ops@hangwork.art',
		DB: fakeDb(purchases),
	});

	const get = (token: string) =>
		new Request('https://api.hangwork.art/admin/funnel', {
			headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
		});

	const operatorToken = async () => {
		const now = Math.floor(Date.now() / 1000);
		return signJwt({ sub: operator.id, iat: now, exp: now + 60 }, SECRET);
	};

	it('refuses a caller without an operator session', async () => {
		const response = await worker.fetch(get('not-a-session'), adminEnv(new MemoryKv()));
		expect(response.status).toBe(401);
	});

	it('refuses a signed-in account that is not on the allowlist', async () => {
		const bindings = { ...adminEnv(new MemoryKv()), ADMIN_EMAILS: 'someone-else@hangwork.art' };
		const response = await worker.fetch(get(await operatorToken()), bindings);
		expect(response.status).toBe(403);
	});

	it('returns monthly aggregates with a direct column and D1 purchase counts', async () => {
		const kv = new MemoryKv();
		const period = new Date().toISOString().slice(0, 7);
		await kv.put(
			`funnel:${period}`,
			JSON.stringify({ steps: { landing: { 'tt-video-3': 10, direct: 4 }, editor: { 'tt-video-3': 3 } } }),
		);
		const bindings = adminEnv(kv, [{ period, purchases: 2 }]);

		const response = await worker.fetch(get(await operatorToken()), bindings);
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			steps: string[];
			periods: { period: string; refs: string[]; steps: Record<string, Record<string, number>>; purchases: number }[];
		};
		expect(data.steps).toEqual([...FUNNEL_STEPS]);
		expect(data.periods).toHaveLength(6);
		const current = data.periods[0];
		expect(current.period).toBe(period);
		expect(current.refs).toContain('direct');
		expect(current.steps.landing).toEqual({ 'tt-video-3': 10, direct: 4 });
		expect(current.steps.checkout).toEqual({});
		expect(current.purchases).toBe(2);
	});
});

describe('funnel beacon never ships in a published artist site', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				String(url).includes('hangwork-runtime/')
					? new Response('/* runtime */', { status: 200 })
					: new Response('binary', { status: 200 }),
			),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('leaves no /funnel/event reference in staticgen output', async () => {
		const content = parseAndMigrateContent({
			...blankContent,
			site: { ...blankContent.site, name: 'Jane Doe' },
		});
		const bundle: PortfolioBundle = {
			contentJson: content,
			files: [{ path: 'src/assets/selected-works/01-blue.jpg', bytes: new TextEncoder().encode('fake-jpeg') }],
		};
		const site = await generateStaticSite(bundle, {
			siteUrl: 'https://jane.hangwork.art',
			editorBase: 'https://hangwork.art/',
		});
		const text = site.files.map((file) => new TextDecoder().decode(file.bytes)).join('\n');
		expect(text).not.toContain('/funnel/event');
		expect(text).not.toContain('hangwork:funnel-ref');
	});
});
