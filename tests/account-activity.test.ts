import { describe, expect, it } from 'vitest';
import { recordUserSignIn, touchUser, upsertUserByEmail } from '../oauth-proxy/lib/db.js';

class ActivityDb {
	calls: Array<{ sql: string; args: unknown[]; method: 'first' | 'run' }> = [];
	user: Record<string, unknown> | null = null;
	userById: Record<string, unknown> | null = null;

	prepare(sql: string) {
		const db = this;
		return {
			bind(...args: unknown[]) {
				return {
					async first() {
						db.calls.push({ sql, args, method: 'first' });
						if (sql.includes('WHERE email = ?')) return db.user;
						if (sql.includes('WHERE id = ?')) return db.userById;
						return null;
					},
					async run() {
						db.calls.push({ sql, args, method: 'run' });
						return { success: true };
					},
				};
			},
		};
	}
}

describe('account activity timestamps', () => {
	it('records sign-in separately from account updates', async () => {
		const db = new ActivityDb();
		const signedInAt = await recordUserSignIn(db, 'user-1');
		const updatedAt = await touchUser(db, 'user-1');

		expect(Number.isNaN(Date.parse(signedInAt))).toBe(false);
		expect(Number.isNaN(Date.parse(updatedAt))).toBe(false);
		expect(db.calls[0]).toMatchObject({
			sql: expect.stringContaining('SET last_sign_in_at = ?'),
			args: [signedInAt, 'user-1'],
			method: 'run',
		});
		expect(db.calls[1]).toMatchObject({
			sql: expect.stringContaining('SET updated_at = ?'),
			args: [updatedAt, 'user-1'],
			method: 'run',
		});
	});

	it('gives a newly created account matching creation and update timestamps', async () => {
		const db = new ActivityDb();
		db.user = null;
		db.userById = {
			id: 'returned-user',
			email: 'new@example.com',
		};

		await upsertUserByEmail(db, ' New@Example.com ');
		const insert = db.calls.find((call) => call.sql.includes('INSERT INTO users'));
		expect(insert?.args[1]).toBe('new@example.com');
		expect(insert?.args[3]).toBe(insert?.args[4]);
		expect(Number.isNaN(Date.parse(String(insert?.args[3])))).toBe(false);
	});
});
