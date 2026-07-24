// Remembers which Cloudflare-hosted site this browser publishes to, plus the manifest
// the last publish wrote — the direct replacement for github/store.ts RepoInfo. On the
// next publish CloudflareTarget diffs the new manifest against `lastManifest` locally
// (the Worker re-diffs against D1 authoritatively) and the UI shows the saved address.
import { readJson, writeJson, removeKey } from '../storage';

export interface ManifestEntry {
	hash: string;
	size: number;
}

export interface SiteInfo {
	siteId: string;
	subdomain: string;
	/** The live URL, e.g. https://jane.hangwork.art */
	url: string;
	/** Custom domain routed to this site (Worker/D1 is the source of truth). */
	customDomain?: string;
	/** path → { hash, size } for every file the last publish wrote. */
	lastManifest: Record<string, ManifestEntry>;
	lastPublishedAt?: string;
}

const SITE_KEY = 'portfolio-editor:cf-site';
const SITE_NAME_DRAFT_PREFIX = 'portfolio-editor:site-name-draft:';

export function loadSiteInfo(): SiteInfo | null {
	return readJson<SiteInfo>(SITE_KEY);
}

export function saveSiteInfo(info: SiteInfo): void {
	writeJson(SITE_KEY, info);
}

/** Forget the saved site — e.g. the account signed out or the site was removed. */
export function clearSiteInfo(): void {
	removeKey(SITE_KEY);
}

/** Keep an unfinished first-publish address private to the signed-in account. */
export function loadSiteNameDraft(userId: string): string | null {
	return userId ? readJson<string>(`${SITE_NAME_DRAFT_PREFIX}${userId}`) : null;
}

export function saveSiteNameDraft(userId: string, value: string): void {
	if (userId) writeJson(`${SITE_NAME_DRAFT_PREFIX}${userId}`, value);
}

export function clearSiteNameDraft(userId: string): void {
	if (userId) removeKey(`${SITE_NAME_DRAFT_PREFIX}${userId}`);
}

// Injectable store so CloudflareTarget can run outside the browser (mirrors RepoStore —
// tests and dry-runs supply an in-memory one).
export interface SiteStore {
	load(): SiteInfo | null;
	save(info: SiteInfo): void;
}

export const localSiteStore: SiteStore = { load: loadSiteInfo, save: saveSiteInfo };
