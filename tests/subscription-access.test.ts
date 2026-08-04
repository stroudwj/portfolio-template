import { describe, expect, it } from 'vitest';
import {
	pauseSiteForMissingAccess,
	restoreSubscriptionPausedSite,
} from '../oauth-proxy/lib/db.js';
import { exportSite } from '../oauth-proxy/site.js';
import { signJwt } from '../oauth-proxy/lib/jwt.js';

class AccessDb {
	plan: 'lifetime' | 'monthly' | null = null;
	site = { id: 'site-1', user_id: 'user-1', subdomain: 'artist', status: 'active' };
	pause: null | { previous_status: string; subscription_id: string | null } = null;

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
					return args[0] === 'user-1' ? { id: 'user-1', email: 'artist@example.com' } : null;
				}
				if (sql.includes('stable test-adapter marker')) return db.plan ? { plan: db.plan } : null;
				if (sql.includes('SELECT * FROM sites')) return db.site;
				if (sql.includes('SELECT previous_status FROM subscription_site_pauses')) return db.pause;
				throw new Error(`Unexpected first(): ${sql}`);
			},
			async all() {
				if (sql.includes('SELECT hostname FROM hostnames')) {
					return { results: [{ hostname: 'artist.hangwork.art' }] };
				}
				throw new Error(`Unexpected all(): ${sql}`);
			},
			async run() {
				if (sql.includes('INSERT OR IGNORE INTO subscription_site_pauses')) {
					db.pause ??= { previous_status: String(args[1]), subscription_id: args[2] ? String(args[2]) : null };
					return { success: true };
				}
				if (sql.includes('UPDATE sites SET status')) {
					db.site.status = String(args[0]);
					return { success: true };
				}
				if (sql.includes('DELETE FROM subscription_site_pauses')) {
					db.pause = null;
					return { success: true };
				}
				throw new Error(`Unexpected run(): ${sql}`);
			},
		};
	}
}

describe('monthly access lifecycle', () => {
	it('takes the site offline when access ends and restores its prior visibility after payment', async () => {
		const db = new AccessDb();
		const routes = new Map<string, string>();
		const kv = {
			async put(key: string, value: string) {
				routes.set(key, value);
			},
		};

		await pauseSiteForMissingAccess(db, kv, 'user-1', 'subscription-1');
		expect(db.site.status).toBe('subscription_lapsed');
		expect(db.pause).toEqual({ previous_status: 'active', subscription_id: 'subscription-1' });
		expect(JSON.parse(routes.get('host:artist.hangwork.art') || '{}')).toMatchObject({
			siteId: 'site-1',
			status: 'subscription_lapsed',
		});

		db.plan = 'monthly';
		await restoreSubscriptionPausedSite(db, kv, 'user-1');
		expect(db.site.status).toBe('active');
		expect(db.pause).toBeNull();
		expect(JSON.parse(routes.get('host:artist.hangwork.art') || '{}').status).toBe('active');
	});

	it('denies the server-side site export to monthly accounts', async () => {
		const db = new AccessDb();
		db.plan = 'monthly';
		const secret = 'monthly-export-session-secret';
		const now = Math.floor(Date.now() / 1000);
		const token = await signJwt({ sub: 'user-1', iat: now, exp: now + 60 }, secret);
		const response = await exportSite(
			new Request('https://worker.example/site/export', {
				headers: { Authorization: `Bearer ${token}` },
			}),
			{ SESSION_SECRET: secret, DB: db, KV: {}, SITES: {} },
			'https://hangwork.art',
		);
		expect(response.status).toBe(402);
		expect(await response.json()).toEqual({ error: 'lifetime_required' });
	});
});
