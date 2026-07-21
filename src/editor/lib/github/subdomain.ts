// Default web addresses: every new site gets [name].hangwork.art instead of the raw
// github.io URL. The Worker (oauth-proxy/worker.js, /subdomain/* routes) owns the DNS
// side; this module is the browser client for it. Every failure mode maps to a soft
// answer — publishing must NEVER break because the address service is down, it just
// falls back to [user].github.io/[name].
import { WORKER_TOKEN_URL } from '../oauth/config';

/** The domain new sites live under. Keep in sync with SITES_ROOT_DOMAIN in the Worker. */
export const SITES_ROOT_DOMAIN = 'hangwork.art';

/** "my-name" → "my-name.hangwork.art" */
export function subdomainFor(name: string): string {
	return `${name}.${SITES_ROOT_DOMAIN}`;
}

/** Clean a name while it is being typed. Unlike slugifySiteName, this deliberately
 * preserves an empty value and one trailing dash so normal editing is not interrupted. */
export function sanitizeSiteNameInput(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+/, '')
		.slice(0, 63);
}

/** A finished site name is a valid DNS label: no empty value or edge dashes. */
export function isValidSiteName(s: string): boolean {
	return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s);
}

/**
 * A site name must work as BOTH a repo name and a DNS label: lowercase letters, digits
 * and inner hyphens, ≤63 chars. (Stricter than repo names — no dots/underscores.)
 */
export function slugifySiteName(s: string): string {
	return sanitizeSiteNameInput(s.trim()).replace(/-+$/, '') || 'my-portfolio';
}

export type SubdomainAvailability = 'available' | 'taken' | 'unknown';

async function post(route: string, token: string, name: string): Promise<Response | null> {
	if (!WORKER_TOKEN_URL) return null;
	try {
		return await fetch(`${WORKER_TOKEN_URL}${route}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, name }),
		});
	} catch {
		return null; // network/blocked — treat as "service unavailable"
	}
}

/** Is name.hangwork.art free (or already ours)? 'unknown' = couldn't ask, don't block. */
export async function checkSubdomain(token: string, name: string): Promise<SubdomainAvailability> {
	const res = await post('/subdomain/check', token, name);
	if (!res) return 'unknown';
	if (res.status === 409) return 'taken';
	if (!res.ok) return 'unknown';
	try {
		const data = (await res.json()) as { available?: boolean };
		return data.available ? 'available' : 'taken';
	} catch {
		return 'unknown';
	}
}

/**
 * Claim name.hangwork.art for the token's GitHub account (idempotent for re-claims of
 * our own name). Returns the full domain on success, null on ANY failure — callers fall
 * back to the github.io address.
 */
export async function claimSubdomain(token: string, name: string): Promise<string | null> {
	const res = await post('/subdomain/claim', token, name);
	if (!res || !res.ok) return null;
	try {
		const data = (await res.json()) as { domain?: string };
		return data.domain ?? null;
	} catch {
		return null;
	}
}
