// Payment decoupled from publish + the phone handoff. Publishing needs two independent
// conditions (built site, unlocked account) in either order; phones get the door and a
// "send me the link" email whose Worker route only ever mails a buyer's own address.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDoc } from '../src/editor/lib/content-init';
import { hasPublishableContent } from '../src/editor/lib/validation';
import worker from '../oauth-proxy/worker.js';
import { signJwt } from '../oauth-proxy/lib/jwt.js';

describe('hasPublishableContent (the "built" half of publishing)', () => {
	it('treats a fresh blank document as not built', () => {
		expect(hasPublishableContent(blankDoc())).toBe(false);
	});

	it('counts only images that really exist in this browser', () => {
		const doc = blankDoc();
		doc.galleries['art'] = [
			{ id: 'e1', filename: 'ghost.jpg', meta: { title: '', alt: '', description: '', link: '' }, assetId: null },
		];
		expect(hasPublishableContent(doc)).toBe(false); // referenced by name, never uploaded
		doc.galleries['art'][0].assetId = 'a1';
		expect(hasPublishableContent(doc)).toBe(true);
	});

	it('counts written text, video embeds, and a bio as content', () => {
		const withText = blankDoc();
		withText.content.pages.home.blocks!.push({ id: 't1', type: 'text', text: 'Open studio, June.' });
		expect(hasPublishableContent(withText)).toBe(true);

		const withEmbed = blankDoc();
		withEmbed.content.pages.home.blocks!.push({ id: 'v1', type: 'embed', url: 'https://youtu.be/x' });
		expect(hasPublishableContent(withEmbed)).toBe(true);

		const withBio = blankDoc();
		withBio.content.profile.bio = 'Painter in Marseille.';
		expect(hasPublishableContent(withBio)).toBe(true);

		const blankText = blankDoc();
		blankText.content.pages.home.blocks!.push({ id: 't2', type: 'text', text: '   ' });
		expect(hasPublishableContent(blankText)).toBe(false);
	});
});

// --- Worker /handoff ---------------------------------------------------------------

const ORIGIN = 'https://hangwork.art';
const ENV = {
	ALLOWED_ORIGIN: 'https://hangwork.art,https://portfolio-template-9p2.pages.dev',
	RESEND_API_KEY: 'test-key',
	EMAIL_FROM: 'Hangwork <hello@hangwork.art>',
};

function handoffRequest(body: unknown, origin = ORIGIN, ip = '203.0.113.7', token?: string) {
	return new Request('https://worker.example/handoff', {
		method: 'POST',
		headers: {
			Origin: origin,
			'Content-Type': 'application/json',
			'CF-Connecting-IP': ip,
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

class HandoffDb {
	constructor(private licensed: boolean) {}

	prepare(sql: string) {
		const db = this;
		let args: unknown[] = [];
		return {
			bind(...next: unknown[]) {
				args = next;
				return this;
			},
			async first() {
				if (sql.includes('SELECT * FROM users WHERE id = ?')) {
					return args[0] === 'buyer-user' ? { id: 'buyer-user', email: 'buyer@example.com' } : null;
				}
				if (sql.includes('SELECT 1 AS licensed')) return db.licensed ? { licensed: 1 } : null;
				if (sql.includes('SELECT * FROM sites')) return null;
				throw new Error(`Unexpected first(): ${sql}`);
			},
			async run() {
				if (sql.includes('UPDATE licenses SET user_id') || sql.includes('UPDATE polar_orders SET user_id')) {
					return { success: true };
				}
				throw new Error(`Unexpected run(): ${sql}`);
			},
		};
	}
}

describe('worker /handoff', () => {
	const fetchMock = vi.fn();
	let ipCounter = 0;
	// Each test gets its own IP so the per-isolate rate limiter (module state that
	// survives between tests) never bleeds across tests.
	const nextIp = () => `203.0.113.${++ipCounter}`;

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('answers 503 until the email service is configured', async () => {
		const res = await worker.fetch(handoffRequest({ email: 'a@b.co' }, ORIGIN), {
			ALLOWED_ORIGIN: ENV.ALLOWED_ORIGIN,
		});
		expect(res.status).toBe(503);
		expect((await res.json()).error).toBe('email_unconfigured');
	});

	it('rejects foreign origins outright', async () => {
		const res = await worker.fetch(handoffRequest({ email: 'a@b.co' }, 'https://evil.example'), ENV);
		expect(res.status).toBe(403);
	});

	it('emails a typed address the plain editor link', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const res = await worker.fetch(handoffRequest({ email: 'artist@example.com' }, ORIGIN, nextIp()), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true, email: 'artist@example.com' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		const sent = JSON.parse(init.body);
		expect(sent.to).toEqual(['artist@example.com']);
		expect(sent.subject).toBe('Your Hangwork link');
		expect(sent.text).toContain('https://hangwork.art/editor/');
		expect(sent.text).not.toContain('license_key');
	});

	it('mails a signed-in buyer at the account address with paid copy', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const now = Math.floor(Date.now() / 1000);
		const secret = 'handoff-session-secret';
		const token = await signJwt({ sub: 'buyer-user', iat: now, exp: now + 60 }, secret);
		const res = await worker.fetch(handoffRequest({}, ORIGIN, nextIp(), token), {
			...ENV,
			SESSION_SECRET: secret,
			DB: new HandoffDb(true),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true, email: 'buyer@example.com' });

		const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(sent.to).toEqual(['buyer@example.com']);
		expect(sent.subject).toBe('Your Hangwork access is ready');
		expect(sent.text).toContain('https://hangwork.art/editor/');
		expect(sent.text).not.toContain('license_key');
	});

	it('uses plain handoff copy for a signed-in account without access', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const now = Math.floor(Date.now() / 1000);
		const secret = 'handoff-unlicensed-session-secret';
		const token = await signJwt({ sub: 'buyer-user', iat: now, exp: now + 60 }, secret);
		const res = await worker.fetch(handoffRequest({}, ORIGIN, nextIp(), token), {
			...ENV,
			SESSION_SECRET: secret,
			DB: new HandoffDb(false),
		});
		expect(res.status).toBe(200);
		const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(sent.to).toEqual(['buyer@example.com']);
		expect(sent.subject).toBe('Your Hangwork link');
	});

	it('rate-limits repeated sends from one address', async () => {
		fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
		const ip = nextIp();
		for (let i = 0; i < 4; i++) {
			const ok = await worker.fetch(handoffRequest({ email: 'a@b.co' }, ORIGIN, ip), ENV);
			expect(ok.status).toBe(200);
		}
		const blocked = await worker.fetch(handoffRequest({ email: 'a@b.co' }, ORIGIN, ip), ENV);
		expect(blocked.status).toBe(429);
	});
});
