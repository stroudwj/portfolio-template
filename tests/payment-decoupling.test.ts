// Payment decoupled from publish + the phone handoff. Publishing needs two independent
// conditions (built site, unlocked account) in either order; phones get the door and a
// "send me the link" email whose Worker route only ever mails a buyer's own address.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDoc } from '../src/editor/lib/content-init';
import { hasPublishableContent } from '../src/editor/lib/validation';
import worker from '../oauth-proxy/worker.js';

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
	LS_STORE_ID: '431697',
	LS_PRODUCT_ID: '1221404',
};

function handoffRequest(body: unknown, origin = ORIGIN, ip = '203.0.113.7') {
	return new Request('https://worker.example/handoff', {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
		body: JSON.stringify(body),
	});
}

function lsValidateResponse(overrides: Partial<{ status: string; store_id: number; product_id: number; customer_email: string }> = {}) {
	return {
		valid: true,
		license_key: { status: overrides.status ?? 'active' },
		meta: {
			store_id: overrides.store_id ?? 431697,
			product_id: overrides.product_id ?? 1221404,
			customer_email: overrides.customer_email ?? 'buyer@example.com',
		},
	};
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

	it('mails a buyer at the address on the purchase, with an auto-unlock link', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response(JSON.stringify(lsValidateResponse()), { status: 200 }))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const res = await worker.fetch(handoffRequest({ license_key: 'KEY-123' }, ORIGIN, nextIp()), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true, email: 'buyer@example.com' });

		const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(sent.to).toEqual(['buyer@example.com']);
		expect(sent.subject).toBe('You own Hangwork now');
		expect(sent.text).toContain('https://hangwork.art/editor/?license_key=KEY-123');
	});

	it('sends nothing for disabled keys or keys from another product', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(lsValidateResponse({ status: 'disabled' })), { status: 200 }),
		);
		const refunded = await worker.fetch(handoffRequest({ license_key: 'K' }, ORIGIN, nextIp()), ENV);
		expect(refunded.status).toBe(400);

		fetchMock.mockReset();
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(lsValidateResponse({ product_id: 999 })), { status: 200 }),
		);
		const foreign = await worker.fetch(handoffRequest({ license_key: 'K' }, ORIGIN, nextIp()), ENV);
		expect(foreign.status).toBe(400);
		// Only the Lemon Squeezy lookups ran — Resend was never called.
		expect(fetchMock.mock.calls.every(([url]) => String(url).includes('lemonsqueezy'))).toBe(true);
	});

	it('still mails a not-yet-activated ("inactive") key — that is a real purchase', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response(JSON.stringify(lsValidateResponse({ status: 'inactive' })), { status: 200 }))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const res = await worker.fetch(handoffRequest({ license_key: 'K2' }, ORIGIN, nextIp()), ENV);
		expect(res.status).toBe(200);
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
