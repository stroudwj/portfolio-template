// React state for the GitHub connection. There's no server session — this just tracks
// whether the stored token still works and who it belongs to. The token can arrive two
// ways: pasted (personal access token) or minted by the one-click OAuth flow; both end at
// the same stored-token state.
import { useCallback, useEffect, useState } from 'react';
import { getToken, setToken, clearToken, validateToken, type GitHubUser } from '../lib/github/session';
import { completeOAuthRedirect, startOAuth } from '../lib/oauth/flow';
import { isOAuthConfigured, WORKER_REVOKE_URL } from '../lib/oauth/config';

export type ConnectionStatus = 'checking' | 'idle' | 'connected';

export interface GitHubSession {
	status: ConnectionStatus;
	user: GitHubUser | null;
	/** Validate + store a pasted token. Throws GitHubError if the token is bad. */
	connect(token: string): Promise<GitHubUser>;
	/** Start the one-click OAuth flow (redirects to GitHub). */
	authorize(): void;
	signOut(): void;
	/** Whether the OAuth App + Worker are configured (else only the token flow is offered). */
	oauthEnabled: boolean;
	/** A message from a failed OAuth return, for the UI to surface. */
	error: string | null;
}

export function useGitHub(): GitHubSession {
	const [status, setStatus] = useState<ConnectionStatus>('checking');
	const [user, setUser] = useState<GitHubUser | null>(null);
	const [error, setError] = useState<string | null>(null);

	// On load: if we're returning from GitHub's consent screen, finish the OAuth exchange
	// and store the token first; then silently re-validate whatever token we now hold (this
	// also covers the "stored token expired" path).
	useEffect(() => {
		let alive = true;
		void (async () => {
			const oauth = await completeOAuthRedirect(); // memoized — safe across hook instances
			if (!alive) return;
			if (oauth.error) setError(oauth.error);
			if (oauth.token) setToken(oauth.token);

			const token = getToken();
			if (!token) {
				setStatus('idle');
				return;
			}
			try {
				const u = await validateToken(token);
				if (!alive) return;
				setUser(u);
				setStatus('connected');
			} catch {
				if (!alive) return;
				clearToken();
				setStatus('idle');
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	const connect = useCallback(async (token: string) => {
		const u = await validateToken(token); // throws on invalid — caller shows the message
		setToken(token);
		setUser(u);
		setStatus('connected');
		setError(null);
		return u;
	}, []);

	const authorize = useCallback(() => {
		startOAuth(); // navigates away
	}, []);

	const signOut = useCallback(() => {
		// Best-effort: actually invalidate the token on GitHub (via the Worker, which holds
		// the client secret), not just forget it locally. Fire-and-forget — a pasted PAT
		// isn't this app's token (the Worker treats GitHub's 404 as success), and a network
		// failure shouldn't block signing out of the editor.
		const token = getToken();
		if (token && WORKER_REVOKE_URL) {
			void fetch(WORKER_REVOKE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
				keepalive: true,
			}).catch(() => {});
		}
		clearToken();
		setUser(null);
		setStatus('idle');
	}, []);

	return { status, user, connect, authorize, signOut, oauthEnabled: isOAuthConfigured(), error };
}
