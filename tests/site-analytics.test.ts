import { describe, expect, it } from 'vitest';
import siteWorker from '../site-server/worker.js';

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

describe('privacy-light portfolio analytics', () => {
	it('aggregates opens, viewing time, and inquiries without visitor identifiers', async () => {
		const kv = new MemoryKv();
		await kv.put('host:artist.hangwork.art', JSON.stringify({ siteId: 'site-1', status: 'active' }));
		const env = { KV: kv, SITES: { get: async () => null, head: async () => null } };
		const event = async (body: object) =>
			siteWorker.fetch(
				new Request('https://artist.hangwork.art/__hangwork/event', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Origin: 'https://artist.hangwork.art',
					},
					body: JSON.stringify(body),
				}),
				env,
			);

		expect((await event({ page: 'work/blue-room', event: 'open' })).status).toBe(204);
		expect((await event({ page: 'work/blue-room', event: 'view', duration: 43 })).status).toBe(204);
		expect((await event({ page: 'work/blue-room', event: 'inquiry' })).status).toBe(204);

		const period = new Date().toISOString().slice(0, 7);
		const stored = await kv.get(`analytics:site-1:${period}`, 'json') as {
			pages: Record<string, Record<string, number>>;
		};
		expect(stored.pages['work/blue-room']).toEqual({
			opens: 1,
			seconds: 43,
			longest: 43,
			inquiries: 1,
		});
		expect(JSON.stringify(stored)).not.toMatch(/ip|referrer|cookie|visitor/i);
	});

	it('rejects unknown events and oversized page keys safely', async () => {
		const kv = new MemoryKv();
		await kv.put('host:artist.hangwork.art', JSON.stringify({ siteId: 'site-1', status: 'active' }));
		const response = await siteWorker.fetch(
			new Request('https://artist.hangwork.art/__hangwork/event', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ page: '', event: 'identify', email: 'person@example.com' }),
			}),
			{ KV: kv, SITES: {} },
		);
		expect(response.status).toBe(400);
	});
});
