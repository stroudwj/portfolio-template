import { describe, expect, it } from 'vitest';
import worker from '../oauth-proxy/worker.js';
import { signJwt } from '../oauth-proxy/lib/jwt.js';

const ORIGIN = 'https://hangwork.art';
const SESSION_SECRET = 'tester-access-session-secret';
const ACCESS_CODE = 'HANGWORK-UNIT-TEST-CODE-1234';
const user = {
	id: 'tester-user',
	email: 'tester@example.com',
	google_sub: 'tester-google-sub',
	created_at: '2026-07-26T12:00:00.000Z',
	updated_at: '2026-07-26T12:00:00.000Z',
};

class TestDb {
	entitlement: null | { id: string; status: string; reason: string; created_at: string } = null;
	auditWrites = 0;

	prepare(sql: string) {
		const db = this;
		let args: unknown[] = [];
		return {
			bind(...next: unknown[]) {
				args = next;
				return this;
			},
			async first() {
				if (sql.includes('SELECT * FROM users WHERE id = ?')) return args[0] === user.id ? user : null;
				if (sql.includes('FROM manual_entitlements') && sql.includes('reason = ?')) return db.entitlement;
				if (sql.includes('SELECT 1 AS licensed')) {
					return db.entitlement?.status === 'active' ? { licensed: 1 } : null;
				}
				if (sql.includes('SELECT * FROM sites')) return null;
				throw new Error(`Unexpected first(): ${sql}`);
			},
			async run() {
				if (sql.includes('UPDATE licenses SET user_id')) return { success: true };
				if (sql.includes('UPDATE polar_orders SET user_id')) return { success: true };
				if (sql.includes('INSERT OR IGNORE INTO manual_entitlements')) {
					if (!db.entitlement || db.entitlement.status !== 'active') {
						db.entitlement = {
							id: String(args[0]),
							status: 'active',
							reason: String(args[2]),
							created_at: String(args[4]),
						};
					}
					return { success: true };
				}
				if (sql.includes('INSERT INTO admin_audit_log')) {
					db.auditWrites += 1;
					return { success: true };
				}
				if (sql.includes('UPDATE users SET updated_at')) return { success: true };
				throw new Error(`Unexpected run(): ${sql}`);
			},
		};
	}

	async batch(statements: Array<{ run(): Promise<unknown> }>) {
		return Promise.all(statements.map((statement) => statement.run()));
	}
}

async function token() {
	const now = Math.floor(Date.now() / 1000);
	return signJwt({ sub: user.id, iat: now, exp: now + 60 }, SESSION_SECRET);
}

async function redeem(db: TestDb, code: string, overrides: Record<string, unknown> = {}) {
	return worker.fetch(
		new Request('https://worker.example/auth/test-access/redeem', {
			method: 'POST',
			headers: {
				Origin: ORIGIN,
				Authorization: `Bearer ${await token()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ code }),
		}),
		{
			ALLOWED_ORIGIN: ORIGIN,
			SESSION_SECRET,
			TEST_ACCESS_CODE: ACCESS_CODE,
			DB: db,
			...overrides,
		},
	);
}

describe('reusable tester access', () => {
	it('requires configuration, a signed-in account, and the exact code', async () => {
		const db = new TestDb();
		const unconfigured = await redeem(db, ACCESS_CODE, { TEST_ACCESS_CODE: '' });
		expect(unconfigured.status).toBe(503);
		expect(await unconfigured.json()).toEqual({ error: 'test_access_unconfigured' });

		const wrong = await redeem(db, 'WRONG-CODE-WITH-LENGTH');
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toEqual({ error: 'invalid_test_access_code' });

		const signedOut = await worker.fetch(
			new Request('https://worker.example/auth/test-access/redeem', {
				method: 'POST',
				headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: ACCESS_CODE }),
			}),
			{ ALLOWED_ORIGIN: ORIGIN, SESSION_SECRET, TEST_ACCESS_CODE: ACCESS_CODE, DB: db },
		);
		expect(signedOut.status).toBe(401);
	});

	it('creates an account-level manual grant and is idempotent afterward', async () => {
		const db = new TestDb();
		const first = await redeem(db, ACCESS_CODE);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({
			user: { id: user.id, email: user.email },
			licensed: true,
			site: null,
		});
		expect(db.entitlement).toMatchObject({ status: 'active', reason: 'Tester access code' });
		expect(db.auditWrites).toBe(1);

		const second = await redeem(db, ACCESS_CODE);
		expect(second.status).toBe(200);
		expect((await second.json()).licensed).toBe(true);
		expect(db.auditWrites).toBe(1);
	});

	it('does not let a revoked tester immediately redeem the shared code again', async () => {
		const db = new TestDb();
		db.entitlement = {
			id: 'revoked-grant',
			status: 'revoked',
			reason: 'Tester access code',
			created_at: '2026-07-26T12:00:00.000Z',
		};
		const response = await redeem(db, ACCESS_CODE);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'test_access_revoked' });
	});
});
