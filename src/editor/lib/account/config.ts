// Configuration for Hangwork accounts (magic-link + Google sign-in, Cloudflare-hosted
// publishing). The API lives on the same Worker as the old OAuth proxy — one server-side
// deployment for the whole product (oauth-proxy/worker.js).
//
// Until the Worker has its account bindings (D1/KV/R2 + SESSION_SECRET), every account
// route answers 503 `accounts_unconfigured` and the editor keeps working signed-out.

/** The deployed Worker (also in oauth/config.ts WORKER_TOKEN_URL — keep in sync).
 *  PUBLIC_HANGWORK_API_URL overrides it for local dev against `wrangler dev`. */
export const ACCOUNT_API_URL: string =
	import.meta.env.PUBLIC_HANGWORK_API_URL || 'https://portfolio-oauth-proxy.simpleportfolioeditor.workers.dev';

/** Google OAuth client id (public). Empty = the "Continue with Google" button is hidden
 *  and magic-link is the only sign-in. Must match GOOGLE_CLIENT_ID in the Worker. */
export const GOOGLE_CLIENT_ID = '132981170943-auqcp7i1vrh5eulgvd05mhv1e7dg7426.apps.googleusercontent.com';

/** Google's authorize endpoint (where we send the user to grant access). */
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export function isAccountsConfigured(): boolean {
	return Boolean(ACCOUNT_API_URL);
}

export function isGoogleConfigured(): boolean {
	return Boolean(GOOGLE_CLIENT_ID) && isAccountsConfigured();
}

/** Where sign-in flows land back. Must be a registered Google redirect URI. */
export function redirectUri(): string {
	return typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
}
