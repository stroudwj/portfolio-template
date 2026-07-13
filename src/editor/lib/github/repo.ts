// Repository-level operations: create the user's repo from the template, read + rewrite
// astro.config.mjs for the new URL, enable GitHub Pages, and wait for the first build.
import type { GitHubClient } from './client';
import { GitHubError } from './client';
import { TEMPLATE_REPO, ASTRO_CONFIG_PATH } from './config';

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
 * A generated repo isn't populated instantly. Poll a file read until it appears, then
 * return the current astro.config.mjs source rewritten for `owner`/`repo`'s Pages URL.
 */
export async function patchedAstroConfig(client: GitHubClient, ref: RepoRef): Promise<string> {
	let source = '';
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			const { data } = await client.request<{ content: string; encoding: string }>(
				`/repos/${ref.owner}/${ref.repo}/contents/${ASTRO_CONFIG_PATH}`,
			);
			source = decodeBase64Utf8(data.content);
			break;
		} catch (err) {
			if (err instanceof GitHubError && err.status === 404 && attempt < 9) {
				await sleep(1500);
				continue;
			}
			throw err;
		}
	}
	return rewriteSiteAndBase(source, ref.owner, ref.repo);
}

/**
 * Replace the `site` and `base` values so links/assets resolve at
 * https://{owner}.github.io/{repo}. Only the two string literals are touched.
 */
export function rewriteSiteAndBase(source: string, owner: string, repo: string): string {
	return source
		.replace(/(site:\s*)['"][^'"]*['"]/, `$1'https://${owner}.github.io'`)
		.replace(/(base:\s*)['"][^'"]*['"]/, `$1'/${repo}'`);
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

function decodeBase64Utf8(base64: string): string {
	const binary = atob(base64.replace(/\n/g, ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}
