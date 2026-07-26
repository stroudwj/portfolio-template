import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../oauth-proxy/worker.js';
import { signJwt } from '../oauth-proxy/lib/jwt.js';

const ORIGIN = 'https://hangwork.art';
const SECRET = 'admin-console-test-secret';

const adminUser = {
	id: 'user-admin',
	email: 'admin@example.com',
	google_sub: 'google-admin',
	created_at: '2026-07-01T12:00:00.000Z',
};
const artistUser = {
	id: 'user-artist',
	email: 'artist@example.com',
	google_sub: 'google-artist',
	created_at: '2026-07-02T12:00:00.000Z',
};

class FakeStatement {
	private args: unknown[] = [];

	constructor(
		private db: FakeDb,
		private sql: string,
	) {}

	bind(...args: unknown[]) {
		this.args = args;
		return this;
	}

	first() {
		return Promise.resolve(this.db.first(this.sql, this.args));
	}

	all() {
		return Promise.resolve({ results: this.db.all(this.sql, this.args) });
	}

	run() {
		throw new Error('The read-only admin console must never execute a write.');
	}
}

class FakeDb {
	statements: string[] = [];

	prepare(sql: string) {
		this.statements.push(sql);
		return new FakeStatement(this, sql);
	}

	first(sql: string, args: unknown[]) {
		if (sql.includes('SELECT * FROM users WHERE id = ?')) {
			return [adminUser, artistUser].find((user) => user.id === args[0]) ?? null;
		}
		if (sql.includes('admin-account-detail')) {
			if (args[0] !== artistUser.id) return null;
			return {
				id: artistUser.id,
				email: artistUser.email,
				google_connected: 1,
				created_at: artistUser.created_at,
				site_id: 'site-1',
				subdomain: 'artist',
				site_status: 'active',
				bytes_used: 1536,
				req_count_period: 42,
				last_published_at: '2026-07-20T12:00:00.000Z',
				site_created_at: '2026-07-03T12:00:00.000Z',
			};
		}
		throw new Error(`Unexpected first(): ${sql}`);
	}

	all(sql: string, args: unknown[]) {
		if (sql.includes('admin-account-search')) {
			expect(args[0]).toBe('%artist@example.com%');
			return [
				{
					id: artistUser.id,
					email: artistUser.email,
					google_connected: 1,
					created_at: artistUser.created_at,
					site_id: 'site-1',
					subdomain: 'artist',
					site_status: 'active',
					last_published_at: '2026-07-20T12:00:00.000Z',
					licensed: 1,
					license_count: 1,
				},
			];
		}
		if (sql.includes('admin-account-licenses')) {
			return [
				{
					id: 'license-1',
					ls_license_key: 'SECRET-LICENSE-1234',
					ls_order_id: 'order-1',
					buyer_email: 'artist@example.com',
					status: 'active',
					activated_at: '2026-07-04T12:00:00.000Z',
					created_at: '2026-07-04T11:00:00.000Z',
				},
			];
		}
		if (sql.includes('admin-account-hostnames')) {
			return [{ hostname: 'artist.hangwork.art', kind: 'subdomain', created_at: '2026-07-03T12:00:00.000Z' }];
		}
		throw new Error(`Unexpected all(): ${sql}`);
	}
}

function request(path: string, token?: string, body: unknown = {}) {
	return new Request(`https://worker.example${path}`, {
		method: 'POST',
		headers: {
			Origin: ORIGIN,
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function tokenFor(userId: string) {
	const now = Math.floor(Date.now() / 1000);
	return signJwt({ sub: userId, iat: now, exp: now + 60 }, SECRET);
}

describe('read-only admin console API', () => {
	let db: FakeDb;
	let env: Record<string, unknown>;

	beforeEach(() => {
		db = new FakeDb();
		env = {
			ALLOWED_ORIGIN: ORIGIN,
			SESSION_SECRET: SECRET,
			ADMIN_EMAILS: 'admin@example.com',
			SITES_ROOT_DOMAIN: 'hangwork.art',
			DB: db,
		};
	});

	it('requires a signed session and a server-side operator allowlist', async () => {
		const signedOut = await worker.fetch(request('/admin/session'), env);
		expect(signedOut.status).toBe(401);

		const nonAdmin = await worker.fetch(request('/admin/session', await tokenFor(artistUser.id)), env);
		expect(nonAdmin.status).toBe(403);
		expect(await nonAdmin.json()).toEqual({ error: 'admin_forbidden' });

		const unconfigured = await worker.fetch(request('/admin/session', await tokenFor(adminUser.id)), {
			...env,
			ADMIN_EMAILS: '',
		});
		expect(unconfigured.status).toBe(503);
		expect(await unconfigured.json()).toEqual({ error: 'admin_unconfigured' });
	});

	it('searches account summaries for an authorized operator', async () => {
		const response = await worker.fetch(
			request('/admin/accounts/search', await tokenFor(adminUser.id), { query: 'artist@example.com' }),
			env,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			results: [
				{
					user: {
						id: 'user-artist',
						email: 'artist@example.com',
						googleConnected: true,
						createdAt: '2026-07-02T12:00:00.000Z',
					},
					licensed: true,
					licenseCount: 1,
					site: {
						id: 'site-1',
						subdomain: 'artist',
						url: 'https://artist.hangwork.art',
						status: 'active',
						lastPublishedAt: '2026-07-20T12:00:00.000Z',
					},
				},
			],
		});
	});

	it('returns account detail without exposing a full license key or Google subject', async () => {
		const response = await worker.fetch(
			request('/admin/accounts/get', await tokenFor(adminUser.id), { userId: artistUser.id }),
			env,
		);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.user).toEqual({
			id: 'user-artist',
			email: 'artist@example.com',
			googleConnected: true,
			createdAt: '2026-07-02T12:00:00.000Z',
		});
		expect(data.licenses[0].key).toBe('••••1234');
		expect(JSON.stringify(data)).not.toContain('SECRET-LICENSE');
		expect(JSON.stringify(data)).not.toContain('google-artist');
		expect(data.site.url).toBe('https://artist.hangwork.art');
	});

	it('prepares SELECT statements only', async () => {
		await worker.fetch(
			request('/admin/accounts/get', await tokenFor(adminUser.id), { userId: artistUser.id }),
			env,
		);
		expect(db.statements.length).toBeGreaterThan(0);
		expect(db.statements.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true);
	});
});
