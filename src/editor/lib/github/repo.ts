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
 * Replace the real `site`/`base` values so links/assets resolve at
 * https://{owner}.github.io/{repo}. Anchored to the start of a line (multiline flag) so
 * it edits the actual `defineConfig` lines and NOT the example lines in the top comment
 * (which begin with `//`). `[ \t]*` keeps the match on a single line.
 */
export function rewriteSiteAndBase(source: string, owner: string, repo: string): string {
	return source
		.replace(/^([ \t]*site:[ \t]*)['"][^'"]*['"]/m, `$1'https://${owner}.github.io'`)
		.replace(/^([ \t]*base:[ \t]*)['"][^'"]*['"]/m, `$1'/${repo}'`);
}

/** Turn Pages on with the Actions workflow builder. Tolerates "already enabled". */
export async function enablePages(client: GitHubClient, ref: RepoRef): Promise<void> {
	await client.request(`/repos/${ref.owner}/${ref.repo}/pages`, {
		method: 'POST',
		body: { build_type: 'workflow' },
		allow: [409, 422], // 409/422 = a Pages site already exists
	});
}

export interface PagesStatus {
	url: string;
	built: boolean;
}

/** The canonical project-site URL for a repo. */
export function pagesUrl(owner: string, repo: string): string {
	return `https://${owner}.github.io/${repo}`;
}

/**
 * Poll the Pages site until the first build finishes (status 'built'), up to a timeout.
 * Resolves with the URL regardless — a still-building site becomes live shortly after.
 */
export async function waitForPages(client: GitHubClient, ref: RepoRef, timeoutMs = 120000): Promise<PagesStatus> {
	const url = pagesUrl(ref.owner, ref.repo);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { status, data } = await client.request<{ status: string | null; html_url: string }>(
			`/repos/${ref.owner}/${ref.repo}/pages`,
			{ allow: [404] },
		);
		if (status !== 404 && data?.status === 'built') return { url: data.html_url || url, built: true };
		await sleep(4000);
	}
	return { url, built: false };
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
