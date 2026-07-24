// The browser half of Hangwork sign-in (mirror of oauth/flow.ts, minus GitHub).
//
// Two ways in, one result — a session JWT + account summary from the Worker:
//   * Magic link: startMagicLink(email) asks the Worker to email a single-use link that
//     lands back on the editor with `?magic_token=…`.
//   * Google: startGoogleOAuth() redirects to Google's consent screen, which returns
//     with `?code=&state=` for the Worker to exchange server-side.
// completeAuthRedirect() runs once per page load and finishes whichever return it finds.
import { ACCOUNT_API_URL, GOOGLE_AUTHORIZE_URL, GOOGLE_CLIENT_ID, redirectUri } from './config';
import { AccountClient, AccountError } from './client';
import type { AccountSummary } from './session';

const STATE_KEY = 'portfolio-editor:google-state';
const RETURN_TO_EDITOR_KEY = 'portfolio-editor:return-to-editor-after-auth';

export interface AuthResult {
	/** Session token + summary, if a sign-in just completed this page load. */
	session: (AccountSummary & { token: string }) | null;
	/** A friendly message if the round-trip failed (expired link, denied consent…). */
	error: string | null;
}

/** Ask the Worker to email a sign-in link. Throws AccountError with a friendly message. */
export async function startMagicLink(email: string): Promise<void> {
	await new AccountClient(null).request('/auth/magic/start', { body: { email: email.trim() } });
}

/** Redirect to Google's consent screen. Returns to `redirectUri()` with `?code=&state=`. */
export function startGoogleOAuth(returnToEditor = false): void {
	const state = 'g-' + crypto.randomUUID();
	try {
		sessionStorage.setItem(STATE_KEY, state);
		if (returnToEditor) sessionStorage.setItem(RETURN_TO_EDITOR_KEY, '1');
		else sessionStorage.removeItem(RETURN_TO_EDITOR_KEY);
	} catch {
		/* private mode — the exchange will fail the state check and report it */
	}
	const params = new URLSearchParams({
		client_id: GOOGLE_CLIENT_ID,
		redirect_uri: redirectUri(),
		response_type: 'code',
		scope: 'openid email',
		state,
	});
	window.location.assign(`${GOOGLE_AUTHORIZE_URL}?${params.toString()}`);
}

/** Restore the live editor after an OAuth round-trip that began from an open draft. */
export function consumeReturnToEditorAfterAuth(): boolean {
	try {
		const shouldReturn = sessionStorage.getItem(RETURN_TO_EDITOR_KEY) === '1';
		sessionStorage.removeItem(RETURN_TO_EDITOR_KEY);
		return shouldReturn;
	} catch {
		return false;
	}
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

// Single-use: memoize so multiple useAccount() instances mounting on the same page all
// await one exchange (magic tokens and Google codes can each be redeemed exactly once).
let completion: Promise<AuthResult> | null = null;

/** If this page load is a sign-in return, finish it: verify, exchange, tidy the URL. */
export function completeAuthRedirect(): Promise<AuthResult> {
	if (completion) return completion;
	completion = (async (): Promise<AuthResult> => {
		if (typeof window === 'undefined' || !ACCOUNT_API_URL) return { session: null, error: null };
		const url = new URL(window.location.href);
		const magicToken = url.searchParams.get('magic_token');
		const code = url.searchParams.get('code');
		const returnedState = url.searchParams.get('state');
		// Only consume a ?code that OUR Google flow initiated — the legacy GitHub OAuth
		// return also uses ?code, and its own completion must still be able to claim it.
		const isGoogleReturn = Boolean(code && returnedState?.startsWith('g-'));
		if (!magicToken && !isGoogleReturn) return { session: null, error: null };

		// Clear the sign-in params from the address bar regardless of outcome.
		for (const param of ['magic_token', 'code', 'state', 'error', 'error_description', 'scope', 'authuser', 'prompt']) {
			url.searchParams.delete(param);
		}
		window.history.replaceState({}, '', url.pathname + url.search + url.hash);

		try {
			if (magicToken) {
				const { data } = await new AccountClient(null).request<AccountSummary & { token: string }>(
					'/auth/magic/verify',
					{ body: { token: magicToken } },
				);
				return { session: data, error: null };
			}
			const expectedState = readAndClearState();
			if (!returnedState || returnedState !== expectedState) {
				return { session: null, error: 'Sign-in couldn’t be verified (state mismatch). Please try again.' };
			}
			const { data } = await new AccountClient(null).request<AccountSummary & { token: string }>('/auth/google', {
				body: { code, redirect_uri: redirectUri() },
			});
			return { session: data, error: null };
		} catch (err) {
			return { session: null, error: err instanceof AccountError ? err.friendly : 'Sign-in failed. Please try again.' };
		}
	})();
	return completion;
}
