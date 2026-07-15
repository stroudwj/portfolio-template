// The browser half of the "auto-unlock after purchase" flow. Lemon Squeezy's confirmation-modal
// button (and, optionally, the post-purchase redirect) sends the buyer to the editor with their
// real license key in `?license_key=`. This reads it and scrubs it from the URL so the license
// hook can activate it silently — no manual paste. Mirrors oauth/flow.ts.

const PARAM = 'license_key';

// Single-use: read + scrub the URL once per page load, even if several hooks call this.
let completed = false;
let cachedKey: string | null = null;

/**
 * If this page load is a return from Lemon Squeezy checkout, return the license key and strip it
 * from the address bar — done *before* any network call, so the key never leaks via the Referer
 * header and never lingers in browser history. Returns null when there's no key in the URL.
 * Idempotent within a page load.
 */
export function completeLicenseRedirect(): string | null {
	if (completed) return cachedKey;
	completed = true;
	if (typeof window === 'undefined') return null;

	const url = new URL(window.location.href);
	const key = url.searchParams.get(PARAM);
	if (!key) return null;

	// Scrub the key from the URL immediately, regardless of what activation does with it.
	url.searchParams.delete(PARAM);
	window.history.replaceState({}, '', url.pathname + url.search + url.hash);

	cachedKey = key.trim();
	return cachedKey;
}
