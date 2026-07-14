// The GitHub "session" is just a Personal Access Token the user pasted, kept in
// localStorage. There is no server and no OAuth — validation is a single GET /user.
//
// SECURITY (MVP, per plan): the token lives in localStorage and is therefore reachable
// by any script on this origin. We bound the blast radius by asking for a fine-grained
// token (see config.REQUIRED_PERMISSIONS) rather than a classic `repo` token, and
// "Sign out" deletes it. Hardening (CSP, rotation, moving off long-lived client tokens)
// is deferred to post-MVP.
import { GitHubClient } from './client';

const TOKEN_KEY = 'portfolio-editor:gh-token';

export interface GitHubUser {
	login: string;
	name: string | null;
	avatarUrl: string;
}

export function getToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setToken(token: string): void {
	try {
		localStorage.setItem(TOKEN_KEY, token);
	} catch {
		/* quota/unavailable — non-fatal, publish just won't persist the connection */
	}
}

export function clearToken(): void {
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* non-fatal */
	}
}

/** Confirm a token works and return the account it belongs to. Throws GitHubError on 401. */
export async function validateToken(token: string): Promise<GitHubUser> {
	const client = new GitHubClient(token);
	const { data } = await client.request<{ login: string; name: string | null; avatar_url: string }>('/user');
	return { login: data.login, name: data.name, avatarUrl: data.avatar_url };
}
