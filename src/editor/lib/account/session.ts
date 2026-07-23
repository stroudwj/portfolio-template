// The Hangwork account "session" is a signed 30-day JWT from the Worker plus the account
// summary it came with, kept in localStorage (mirror of github/session.ts). No password
// ever exists; sign-out just deletes this. The Worker re-checks licenses/site ownership
// in D1 on every publish, so a stale summary here can never over-grant anything.
import { readJson, writeJson, removeKey } from '../storage';

const SESSION_KEY = 'portfolio-editor:account';

export interface AccountUser {
	id: string;
	email: string;
}

export interface AccountSiteSummary {
	siteId: string;
	subdomain: string | null;
	status: string;
	lastPublishedAt: string | null;
}

/** What /auth/session (and every sign-in route) answers alongside the token. */
export interface AccountSummary {
	user: AccountUser;
	licensed: boolean;
	site: AccountSiteSummary | null;
}

export interface StoredSession {
	token: string;
	user: AccountUser;
}

export function getSession(): StoredSession | null {
	return readJson<StoredSession>(SESSION_KEY);
}

export function setSession(session: StoredSession): void {
	writeJson(SESSION_KEY, session);
}

export function clearSession(): void {
	removeKey(SESSION_KEY);
}
