// The browser half of the GitHub OAuth flow. `startOAuth()` sends the user to GitHub;
// `completeOAuthRedirect()` runs when they come back and turns the `?code=` into a token
// by calling our Worker. Everything after that reuses the existing token session.
import { AUTHORIZE_URL, OAUTH_CLIENT_ID, SCOPES, WORKER_TOKEN_URL, redirectUri } from './config';

const STATE_KEY = 'portfolio-editor:oauth-state';
const RETURN_TARGET_KEY = 'portfolio-editor:oauth-return-target';

export type OAuthReturnTarget = 'editor' | 'published-site';

export interface OAuthResult {
	/** A user access token, if we just completed a sign-in this page load. */
	token: string | null;
	/** A friendly message if the round-trip failed (e.g. denied, CSRF mismatch). */
	error: string | null;
}

/** Redirect to GitHub's consent screen. Returns to `redirectUri()` with `?code=&state=`. */
export function startOAuth(returnTarget: OAuthReturnTarget = 'published-site'): void {
	const state = crypto.randomUUID();
	try {
		sessionStorage.setItem(STATE_KEY, state);
		sessionStorage.setItem(RETURN_TARGET_KEY, returnTarget);
	} catch {
		/* private mode / disabled storage — the exchange will fail the state check and report it */
	}
	const params = new URLSearchParams({
		client_id: OAUTH_CLIENT_ID,
		redirect_uri: redirectUri(),
		scope: SCOPES,
		state,
	});
	window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

/** Read and clear where the user was working before GitHub temporarily navigated away. */
export function consumeOAuthReturnTarget(): OAuthReturnTarget | null {
	try {
		const target = sessionStorage.getItem(RETURN_TARGET_KEY);
		sessionStorage.removeItem(RETURN_TARGET_KEY);
		return target === 'editor' || target === 'published-site' ? target : null;
	} catch {
		return null;
	}
}

// Single-use: memoize so multiple useGitHub() instances mounting on the same page all await
// one exchange (a GitHub `code` can only be redeemed once).
let completion: Promise<OAuthResult> | null = null;

/** If this page load is an OAuth return, finish it: verify state, swap code→token, tidy URL. */
export function completeOAuthRedirect(): Promise<OAuthResult> {
	if (completion) return completion;
	completion = (async (): Promise<OAuthResult> => {
		if (typeof window === 'undefined') return { token: null, error: null };
		const url = new URL(window.location.href);
		const code = url.searchParams.get('code');
		const returnedState = url.searchParams.get('state');
		const denied = url.searchParams.get('error'); // GitHub sends ?error=access_denied if the user cancels

		if (!code && !denied) return { token: null, error: null };

		// Clear the OAuth params from the address bar regardless of outcome.
		const expectedState = readAndClearState();
		url.searchParams.delete('code');
		url.searchParams.delete('state');
		url.searchParams.delete('error');
		url.searchParams.delete('error_description');
		window.history.replaceState({}, '', url.pathname + url.search + url.hash);

		if (denied) return { token: null, error: 'GitHub sign-in was cancelled. You can try Authorize again.' };
		if (!WORKER_TOKEN_URL) return { token: null, error: 'GitHub sign-in isn’t configured yet. Use a token instead.' };
		if (!returnedState || returnedState !== expectedState) {
			return { token: null, error: 'GitHub sign-in couldn’t be verified (state mismatch). Please try again.' };
		}

		try {
			const res = await fetch(WORKER_TOKEN_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code }),
			});
			const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
			if (!res.ok || !data.access_token) {
				return { token: null, error: 'Couldn’t complete GitHub sign-in. Please try again, or use a token.' };
			}
			return { token: data.access_token, error: null };
		} catch {
			return { token: null, error: 'Couldn’t reach the sign-in service. Please try again, or use a token.' };
		}
	})();
	return completion;
}

function readAndClearState(): string | null {
	try {
		const s = sessionStorage.getItem(STATE_KEY);
		sessionStorage.removeItem(STATE_KEY);
		return s;
	} catch {
		return null;
	}
}
