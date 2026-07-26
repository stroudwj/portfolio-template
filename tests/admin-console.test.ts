import { beforeEach, describe, expect, it, vi } from 'vitest';
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
		return Promise.resolve(this.db.run(this.sql, this.args));
	}
}

class FakeDb {
	statements: string[] = [];
	manualGrant: null | {
		id: string;
		user_id: string;
		status: string;
		reason: string;
		created_at: string;
		revoked_reason: string | null;
		revoked_at: string | null;
	} = null;
	siteStatus = 'active';
	suspension: null | {
		id: string;
		previous_status: string;
		reason: string;
		suspended_at: string;
		restored_at?: string;
	} = null;
	auditWrites = 0;

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
		if (sql.includes('admin-account-active-suspension')) {
			return this.suspension && !this.suspension.restored_at ? this.suspension : null;
		}
		if (sql.includes('admin-grant-user')) {
			return args[0] === artistUser.id ? { id: artistUser.id, email: artistUser.email } : null;
		}
		if (sql.includes('admin-grant-existing-access')) return this.manualGrant?.status === 'active' ? { licensed: 1 } : null;
		if (sql.includes('admin-revoke-entitlement')) {
			return this.manualGrant?.id === args[0] ? this.manualGrant : null;
		}
		if (sql.includes('admin-site-status-target')) {
			return args[0] === 'site-1'
				? { id: 'site-1', user_id: artistUser.id, subdomain: 'artist', status: this.siteStatus }
				: null;
		}
		if (sql.includes('admin-site-active-suspension')) {
			return this.suspension && !this.suspension.restored_at ? this.suspension : null;
		}
		if (sql.includes('SELECT * FROM sites WHERE id = ?')) {
			return args[0] === 'site-1'
				? { id: 'site-1', user_id: artistUser.id, subdomain: 'artist', status: this.siteStatus }
				: null;
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
		if (sql.includes('admin-account-manual-entitlements')) return this.manualGrant ? [this.manualGrant] : [];
		if (sql.includes('admin-account-audit')) return [];
		if (sql.includes('SELECT hostname FROM hostnames WHERE site_id = ?')) {
			return [{ hostname: 'artist.hangwork.art' }];
		}
		throw new Error(`Unexpected all(): ${sql}`);
	}

	run(sql: string, args: unknown[]) {
		if (sql.includes('INSERT INTO manual_entitlements')) {
			this.manualGrant = {
				id: String(args[0]),
				user_id: String(args[1]),
				status: 'active',
				reason: String(args[2]),
				created_at: String(args[4]),
				revoked_reason: null,
				revoked_at: null,
			};
			return { success: true };
		}
		if (sql.includes('UPDATE manual_entitlements')) {
			const grant = this.manualGrant;
			if (grant && grant.id === args[3]) {
				grant.status = 'revoked';
				grant.revoked_reason = String(args[1]);
				grant.revoked_at = String(args[2]);
			}
			return { success: true };
		}
		if (sql.includes('INSERT INTO site_suspensions')) {
			this.suspension = {
				id: String(args[0]),
				previous_status: String(args[2]),
				reason: String(args[3]),
				suspended_at: String(args[5]),
			};
			return { success: true };
		}
		if (sql.includes("UPDATE sites SET status = 'suspended'")) {
			this.siteStatus = 'suspended';
			return { success: true };
		}
		if (sql.includes('UPDATE sites SET status = ?')) {
			this.siteStatus = String(args[0]);
			return { success: true };
		}
		if (sql.includes('UPDATE site_suspensions')) {
			if (this.suspension) this.suspension.restored_at = String(args[2]);
			return { success: true };
		}
		if (sql.includes('INSERT INTO admin_audit_log')) {
			this.auditWrites += 1;
			return { success: true };
		}
		throw new Error(`Unexpected run(): ${sql}`);
	}

	async batch(statements: FakeStatement[]) {
		return Promise.all(statements.map((statement) => statement.run()));
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

describe('admin console API', () => {
	let db: FakeDb;
	let env: Record<string, unknown>;
	let kv: { put: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		db = new FakeDb();
		kv = { put: vi.fn().mockResolvedValue(undefined) };
		env = {
			ALLOWED_ORIGIN: ORIGIN,
			SESSION_SECRET: SECRET,
			ADMIN_EMAILS: 'admin@example.com',
			SITES_ROOT_DOMAIN: 'hangwork.art',
			DB: db,
			KV: kv,
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
		expect(data.manualEntitlements).toEqual([]);
		expect(data.audit).toEqual([]);
		expect(data.site.suspension).toBeNull();
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

	it('grants and revokes manual access without modifying Lemon Squeezy rows', async () => {
		const token = await tokenFor(adminUser.id);
		const grant = await worker.fetch(
			request('/admin/licenses/grant', token, { userId: artistUser.id, reason: 'Complimentary support access' }),
			env,
		);
		expect(grant.status).toBe(200);
		expect((await grant.json()).granted).toBe(true);
		expect(db.manualGrant).toMatchObject({
			user_id: artistUser.id,
			status: 'active',
			reason: 'Complimentary support access',
		});
		expect(db.auditWrites).toBe(1);

		const revoke = await worker.fetch(
			request('/admin/licenses/revoke', token, {
				entitlementId: db.manualGrant?.id,
				reason: 'Support access is no longer needed',
			}),
			env,
		);
		expect(revoke.status).toBe(200);
		expect((await revoke.json()).revoked).toBe(true);
		expect(db.manualGrant?.status).toBe('revoked');
		expect(db.auditWrites).toBe(2);
		expect(
			db.statements.some((sql) => /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?licenses\b/i.test(sql)),
		).toBe(false);
	});

	it('requires a meaningful reason for operator mutations', async () => {
		const response = await worker.fetch(
			request('/admin/licenses/grant', await tokenFor(adminUser.id), { userId: artistUser.id, reason: 'no' }),
			env,
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid_admin_action' });
		expect(db.manualGrant).toBeNull();
		expect(db.auditWrites).toBe(0);
	});

	it('suspends a site and restores its prior visibility with KV mirroring and audit records', async () => {
		const token = await tokenFor(adminUser.id);
		const suspend = await worker.fetch(
			request('/admin/sites/status', token, { siteId: 'site-1', action: 'suspend', reason: 'Reviewing an abuse report' }),
			env,
		);
		expect(suspend.status).toBe(200);
		expect((await suspend.json()).status).toBe('suspended');
		expect(db.siteStatus).toBe('suspended');
		expect(db.suspension?.previous_status).toBe('active');
		expect(kv.put).toHaveBeenCalledWith(
			'host:artist.hangwork.art',
			JSON.stringify({ siteId: 'site-1', status: 'suspended' }),
		);

		const restore = await worker.fetch(
			request('/admin/sites/status', token, { siteId: 'site-1', action: 'restore', reason: 'Review completed and cleared' }),
			env,
		);
		expect(restore.status).toBe(200);
		expect((await restore.json()).status).toBe('active');
		expect(db.siteStatus).toBe('active');
		expect(db.suspension?.restored_at).toBeTruthy();
		expect(db.auditWrites).toBe(2);
		expect(kv.put).toHaveBeenLastCalledWith(
			'host:artist.hangwork.art',
			JSON.stringify({ siteId: 'site-1', status: 'active' }),
		);
	});
});
