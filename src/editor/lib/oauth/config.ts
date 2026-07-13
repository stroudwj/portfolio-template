// Configuration for the one-click "Authorize with GitHub" (OAuth App) flow.
//
// Fill these two in after registering the OAuth App and deploying the token-exchange
// Worker (see oauth-proxy/README.md). Until BOTH are set, `isOAuthConfigured()` is false
// and the editor cleanly falls back to the manual personal-access-token flow — so the app
// keeps working before OAuth is wired up.
export const OAUTH_CLIENT_ID = ''; // OAuth App "Client ID"
export const WORKER_TOKEN_URL = ''; // deployed Cloudflare Worker URL (its POST endpoint)

/** GitHub's authorize endpoint (where we send the user to grant access). */
export const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

/**
 * Scopes the publish flow needs:
 *  - `repo`     — create the site repository and read/write its contents.
 *  - `workflow` — the template ships .github/workflows/deploy.yml, and GitHub refuses to
 *                 create/update repos carrying workflow files without this scope.
 */
export const SCOPES = 'repo workflow';

/**
 * Where GitHub sends the user back. Must match the OAuth App's registered callback URL.
 * Defaults to the current editor page so a forked deploy works without editing this, but
 * you can hard-code it if you prefer.
 */
export function redirectUri(): string {
	return typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
}

/** True once the OAuth App id + Worker URL are configured; gates the Authorize button. */
export function isOAuthConfigured(): boolean {
	return Boolean(OAUTH_CLIENT_ID) && Boolean(WORKER_TOKEN_URL);
}
