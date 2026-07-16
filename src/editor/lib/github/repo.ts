// Repository-level operations: create the user's repo from the template, read + rewrite
// astro.config.mjs for the new URL, enable GitHub Pages, and wait for the first build.
import type { GitHubClient } from './client';
import { GitHubError } from './client';
import { TEMPLATE_REPO, ASTRO_CONFIG_PATH } from './config';
import { base64ToUtf8 } from './base64';

export interface RepoRef {
	owner: string;
	repo: string;
	branch: string;
}

/** Create a new public repo in `owner`'s account from the template. Returns its ref. */
export async function generateFromTemplate(client: GitHubClient, owner: string, name: string): Promise<RepoRef> {
	const { data } = await client.request<{ default_branch: string }>(
		`/repos/${TEMPLATE_REPO.owner}/${TEMPLATE_REPO.repo}/generate`,
		{ method: 'POST', body: { owner, name, private: false, description: 'My portfolio website' } },
	);
	return { owner, repo: name, branch: data.default_branch || 'main' };
}

export interface TreeItem {
	path: string;
	type: string;
	sha: string;
}

/** All blob (file) entries in the repo, recursively. */
export async function getTree(client: GitHubClient, ref: RepoRef): Promise<TreeItem[]> {
	const { data } = await client.request<{ tree: TreeItem[] }>(
		`/repos/${ref.owner}/${ref.repo}/git/trees/${ref.branch}?recursive=1`,
	);
	return data.tree.filter((t) => t.type === 'blob');
}

/** Every image file currently under src/assets/ in the repo (blobs only). */
export async function listAssetPaths(client: GitHubClient, ref: RepoRef): Promise<string[]> {
	return (await getTree(client, ref)).map((t) => t.path).filter((p) => p.startsWith('src/assets/'));
}

/** Look up an existing repo. Returns null on 404 (e.g. the user deleted it). */
export async function getRepo(client: GitHubClient, owner: string, repo: string): Promise<RepoRef | null> {
	const { status, data } = await client.request<{ default_branch: string }>(`/repos/${owner}/${repo}`, {
		allow: [404],
	});
	if (status === 404) return null;
	return { owner, repo, branch: data.default_branch || 'main' };
}

/** True if `owner/name` is free to use (404 = available). */
export async function isRepoNameAvailable(client: GitHubClient, owner: string, name: string): Promise<boolean> {
	const { status } = await client.request(`/repos/${owner}/${name}`, { allow: [404] });
	return status === 404;
}

/**
 * A generated repo isn't populated instantly. Poll a file read until it appears and
 * return the current astro.config.mjs source. Doubles as a readiness gate on first
 * publish (a successful read means the repo's initial commit exists).
 */
export async function readAstroConfig(client: GitHubClient, ref: RepoRef): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			const { data } = await client.request<{ content: string; encoding: string }>(
				`/repos/${ref.owner}/${ref.repo}/contents/${ASTRO_CONFIG_PATH}`,
			);
			return base64ToUtf8(data.content);
		} catch (err) {
			if (err instanceof GitHubError && err.status === 404 && attempt < 9) {
				await sleep(1500);
				continue;
			}
			throw err;
		}
	}
	throw new GitHubError(404, 'Could not read the new repository’s configuration.');
}

/**
 * Replace the real `site`/`base` values so links/assets resolve at the given URL —
 * https://{owner}.github.io + /{repo} normally, or https://{domain} + / when a custom
 * domain is set. Anchored to the start of a line (multiline flag) so it edits the actual
 * `defineConfig` lines and NOT the example lines in the top comment (which begin with
 * `//`). `[ \t]*` keeps the match on a single line.
 */
export function rewriteSiteAndBase(source: string, siteUrl: string, basePath: string): string {
	return source
		.replace(/^([ \t]*site:[ \t]*)['"][^'"]*['"]/m, `$1'${siteUrl}'`)
		.replace(/^([ \t]*base:[ \t]*)['"][^'"]*['"]/m, `$1'${basePath}'`);
}

/** Turn Pages on with the Actions workflow builder. Tolerates "already enabled". */
export async function enablePages(client: GitHubClient, ref: RepoRef): Promise<void> {
	await client.request(`/repos/${ref.owner}/${ref.repo}/pages`, {
		method: 'POST',
		body: { build_type: 'workflow' },
		allow: [409, 422], // 409/422 = a Pages site already exists
	});
}

export interface PagesInfo {
	/** The custom domain configured in the repo's Pages settings, if any. */
	cname: string | null;
	httpsEnforced: boolean;
}

/** The repo's Pages settings, or null when Pages isn't enabled yet (first publish). */
export async function getPagesInfo(client: GitHubClient, ref: RepoRef): Promise<PagesInfo | null> {
	const { status, data } = await client.request<{ cname: string | null; https_enforced: boolean }>(
		`/repos/${ref.owner}/${ref.repo}/pages`,
		{ allow: [404] },
	);
	if (status === 404) return null;
	return { cname: data.cname ?? null, httpsEnforced: Boolean(data.https_enforced) };
}

/** Point the repo's Pages site at a custom domain (422 = GitHub rejected the domain). */
export async function setCustomDomain(client: GitHubClient, ref: RepoRef, domain: string): Promise<void> {
	await client.request(`/repos/${ref.owner}/${ref.repo}/pages`, { method: 'PUT', body: { cname: domain } });
}

/** Clear the custom domain, returning the site to {owner}.github.io/{repo}. */
export async function removeCustomDomain(client: GitHubClient, ref: RepoRef): Promise<void> {
	await client.request(`/repos/${ref.owner}/${ref.repo}/pages`, { method: 'PUT', body: { cname: null } });
}

export type DomainHealth = 'live' | 'pending' | 'unknown';

/**
 * Whether the custom domain's DNS points at GitHub yet. This endpoint does live DNS
 * lookups (can be slow) and some tokens can't call it at all, so every failure mode
 * maps to 'unknown' — callers show a soft "may still be propagating" message and must
 * never block on it.
 */
export async function getDomainHealth(client: GitHubClient, ref: RepoRef): Promise<DomainHealth> {
	try {
		const { status, data } = await client.request<{ domain?: { is_valid?: boolean } }>(
			`/repos/${ref.owner}/${ref.repo}/pages/health`,
			{ allow: [403, 404, 422] },
		);
		if (status !== 200 || !data?.domain) return 'unknown';
		return data.domain.is_valid ? 'live' : 'pending';
	} catch {
		return 'unknown';
	}
}

/**
 * Best-effort HTTPS enforcement once DNS is live. 422 = the certificate isn't issued
 * yet — expected right after DNS starts resolving; GitHub enables it automatically
 * once the cert is ready, so callers just ignore the outcome.
 */
export async function enforceHttps(client: GitHubClient, ref: RepoRef): Promise<void> {
	await client.request(`/repos/${ref.owner}/${ref.repo}/pages`, {
		method: 'PUT',
		body: { https_enforced: true },
		allow: [422],
	});
}

export type BuildStatus = 'pending' | 'success' | 'failure';

/**
 * Whether the Pages deploy for one specific commit has finished. Filtering runs by
 * `head_sha` pins the check to OUR publish commit (ignoring the template-generation
 * commit's run on first publish), and the run only completes after both the build and
 * deploy-pages jobs finish — so 'success' means the site is actually live. The run
 * takes a few seconds to appear after the ref moves; until then there are no runs
 * for the sha, which is just 'pending'.
 */
export async function getBuildStatus(client: GitHubClient, owner: string, repo: string, sha: string): Promise<BuildStatus> {
	const { data } = await client.request<{ workflow_runs: { status: string; conclusion: string | null }[] }>(
		`/repos/${owner}/${repo}/actions/runs?head_sha=${sha}&per_page=1`,
	);
	const run = data.workflow_runs?.[0];
	if (!run || run.status !== 'completed') return 'pending';
	return run.conclusion === 'success' ? 'success' : 'failure';
}

/** The canonical project-site URL for a repo. */
export function pagesUrl(owner: string, repo: string): string {
	return `https://${owner}.github.io/${repo}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
