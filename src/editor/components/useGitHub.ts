// React state for the GitHub connection. There's no server session — this just tracks
// whether the stored token still works and who it belongs to.
import { useCallback, useEffect, useState } from 'react';
import { getToken, setToken, clearToken, validateToken, type GitHubUser } from '../lib/github/session';

export type ConnectionStatus = 'checking' | 'idle' | 'connected';

export interface GitHubSession {
	status: ConnectionStatus;
	user: GitHubUser | null;
	/** Validate + store a pasted token. Throws GitHubError if the token is bad. */
	connect(token: string): Promise<GitHubUser>;
	signOut(): void;
}

export function useGitHub(): GitHubSession {
	const [status, setStatus] = useState<ConnectionStatus>('checking');
	const [user, setUser] = useState<GitHubUser | null>(null);

	// On load, silently re-validate any stored token (this is the "expired token" path).
	useEffect(() => {
		const token = getToken();
		if (!token) {
			setStatus('idle');
			return;
		}
		let alive = true;
		validateToken(token)
			.then((u) => alive && (setUser(u), setStatus('connected')))
			.catch(() => {
				if (!alive) return;
				clearToken();
				setStatus('idle');
			});
		return () => {
			alive = false;
		};
	}, []);

	const connect = useCallback(async (token: string) => {
		const u = await validateToken(token); // throws on invalid — caller shows the message
		setToken(token);
		setUser(u);
		setStatus('connected');
		return u;
	}, []);

	const signOut = useCallback(() => {
		clearToken();
		setUser(null);
		setStatus('idle');
	}, []);

	return { status, user, connect, signOut };
}
