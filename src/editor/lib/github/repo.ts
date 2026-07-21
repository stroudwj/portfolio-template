// Repository-level operations: create the user's repo from the template, read + rewrite
// astro.config.mjs for the new URL, enable GitHub Pages, and wait for the first build.
import type { GitHubClient } from './client';
import { GitHubError } from './client';
import { TEMPLATE_REPO } from './config';

export interface RepoRef {
	owner: string;
	repo: string;
	branch: string;
}

interface RepoLookup {
	default_branch: string;
	template_repository?: { full_name?: string } | null;
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
	return getTreeAt(client, ref, ref.branch);
}

export async function getTreeAt(client: GitHubClient, ref: RepoRef, treeish: string): Promise<TreeItem[]> {
	const { data } = await client.request<{ tree: TreeItem[] }>(
		`/repos/${ref.owner}/${ref.repo}/git/trees/${treeish}?recursive=1`,
	);
	return data.tree.filter((t) => t.type === 'blob');
}

export async function getBranchHeadSha(client: GitHubClient, ref: RepoRef): Promise<string> {
	const { data } = await client.request<{ object: { sha: string } }>(
		`/repos/${ref.owner}/${ref.repo}/git/ref/heads/${ref.branch}`,
	);
	return data.object.sha;
}

export async function getRepoSnapshot(client: GitHubClient, ref: RepoRef): Promise<{ headSha: string; tree: TreeItem[] }> {
	const headSha = await getBranchHeadSha(client, ref);
	return { headSha, tree: await getTreeAt(client, ref, headSha) };
}

/** Template generation is asynchronous. Wait until its first commit and tree exist. */
export async function waitForRepoTree(client: GitHubClient, ref: RepoRef): Promise<{ headSha: string; tree: TreeItem[] }> {
	const attempts = 20;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const snapshot = await getRepoSnapshot(client, ref);
			// A generated template is never genuinely empty. GitHub can expose the repo
			// before its first tree is ready, so treat an empty tree as another transient.
			if (snapshot.tree.length > 0) return snapshot;
		} catch (error) {
			// During template generation GitHub alternates between 404 and 409
			// ("Git Repository is empty") until the first commit is attached.
			if (!(error instanceof GitHubError) || (error.status !== 404 && error.status !== 409)) throw error;
		}
		if (attempt < attempts - 1) await sleep(1500);
	}
	throw new GitHubError(409, 'GitHub created your repository, but its files are still being prepared. Wait a moment and try publishing again.');
}

/** Every image file currently under src/assets/ in the repo (blobs only). */
export async function listAssetPaths(client: GitHubClient, ref: RepoRef, tree?: TreeItem[]): Promise<string[]> {
	return (tree ?? (await getTree(client, ref))).map((t) => t.path).filter((p) => p.startsWith('src/assets/'));
}

/**
 * Rename the repo. GitHub keeps the repo's identity (Pages settings, custom domain,
 * commit history) intact and redirects the old name for a while — but the built
 * site's own `base` path only matches the new name once astro.config is rewritten
 * and re-committed, which callers must do right after (skippable when a custom
 * domain is set, since then `base` is already '/').
 */
export async function renameRepo(client: GitHubClient, ref: RepoRef, newName: string): Promise<RepoRef> {
	await client.request(`/repos/${ref.owner}/${ref.repo}`, { method: 'PATCH', body: { name: newName } });
	return { ...ref, repo: newName };
}

/** Look up an existing repo. Returns null on 404 (e.g. the user deleted it). */
export async function getRepo(client: GitHubClient, owner: string, repo: string): Promise<RepoRef | null> {
	const { status, data } = await client.request<RepoLookup>(`/repos/${owner}/${repo}`, {
		allow: [404],
	});
	if (status === 404) return null;
	return { owner, repo, branch: data.default_branch || 'main' };
}

/** An earlier template-generation attempt can create the repo before the editor times
 * out reading it. Only an untouched, one-commit repo from our template is safe to adopt. */
export async function findRecoverableTemplateRepo(client: GitHubClient, owner: string, repo: string): Promise<RepoRef | null> {
	const { status, data } = await client.request<RepoLookup>(`/repos/${owner}/${repo}`, { allow: [404] });
	if (status === 404 || data.template_repository?.full_name?.toLowerCase() !== `${TEMPLATE_REPO.owner}/${TEMPLATE_REPO.repo}`.toLowerCase())
		return null;

	const ref = { owner, repo, branch: data.default_branch || 'main' };
	try {
		const commits = await client.request<Array<{ sha: string }>>(`/repos/${owner}/${repo}/commits?per_page=2`);
		return commits.data.length === 1 ? ref : null;
	} catch (error) {
		// A just-generated repository can return 404/409 until GitHub attaches its first
		// commit. Its template provenance still makes this empty state safe to resume.
		if (error instanceof GitHubError && (error.status === 404 || error.status === 409)) return ref;
		throw error;
	}
}

export type RepoNameStatus = 'available' | 'recoverable' | 'taken';

/** Availability for first publish, distinguishing an orphaned Hangwork setup from a collision. */
export async function getRepoNameStatus(client: GitHubClient, owner: string, name: string): Promise<RepoNameStatus> {
	const { status } = await client.request(`/repos/${owner}/${name}`, { allow: [404] });
	if (status === 404) return 'available';
	return (await findRecoverableTemplateRepo(client, owner, name)) ? 'recoverable' : 'taken';
}

/** True if `owner/name` is free to use (404 = available). */
export async function isRepoNameAvailable(client: GitHubClient, owner: string, name: string): Promise<boolean> {
	return (await getRepoNameStatus(client, owner, name)) === 'available';
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
