// One atomic commit via the Git Data API: create a blob per file, assemble a tree on
// top of the current tree (with deletions as sha:null), create a commit, move the ref.
// This lets a single publish add, replace, AND remove files together — exactly what we
// need so deleting an image in the editor deletes it from the live site.
import type { GitHubClient } from './client';
import { bytesToBase64 } from './base64';

/** A file to write in the commit. `text` is UTF-8; `bytes` is binary (images). */
export interface CommitFile {
	path: string;
	text?: string;
	bytes?: Uint8Array;
}

export interface CommitArgs {
	owner: string;
	repo: string;
	branch: string;
	message: string;
	files: CommitFile[];
	/** Paths to remove from the tree (previously published, now gone). */
	deletions?: string[];
	/** Optimistic concurrency guard: abort rather than commit on a newer head. */
	expectedHeadSha?: string;
}

export class CommitHeadChangedError extends Error {
	constructor(
		public readonly expected: string,
		public readonly actual: string,
	) {
		super('The repository changed while this update was being prepared.');
		this.name = 'CommitHeadChangedError';
	}
}

const BLOB_MODE = '100644';

interface TreeEntry {
	path: string;
	mode: typeof BLOB_MODE;
	type: 'blob';
	sha: string | null;
}

/**
 * Commit `files` (and remove `deletions`) onto `branch` in one commit. Returns the new
 * commit sha. `onBlob` is called after each blob upload for progress reporting.
 */
export async function commitFiles(
	client: GitHubClient,
	args: CommitArgs,
	onBlob?: (done: number, total: number) => void,
): Promise<string> {
	const { owner, repo, branch, message, files, deletions = [], expectedHeadSha } = args;
	const base = `/repos/${owner}/${repo}`;

	// Current head + its tree.
	const ref = await client.request<{ object: { sha: string } }>(`${base}/git/ref/heads/${branch}`);
	const headSha = ref.data.object.sha;
	if (expectedHeadSha && headSha !== expectedHeadSha) throw new CommitHeadChangedError(expectedHeadSha, headSha);
	const headCommit = await client.request<{ tree: { sha: string } }>(`${base}/git/commits/${headSha}`);
	const baseTreeSha = headCommit.data.tree.sha;

	// Upload each file as a blob.
	const tree: TreeEntry[] = [];
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const body =
			file.bytes !== undefined
				? { content: bytesToBase64(file.bytes), encoding: 'base64' }
				: { content: file.text ?? '', encoding: 'utf-8' };
		const blob = await client.request<{ sha: string }>(`${base}/git/blobs`, { method: 'POST', body });
		tree.push({ path: file.path, mode: BLOB_MODE, type: 'blob', sha: blob.data.sha });
		onBlob?.(i + 1, files.length);
	}

	// Deletions: a tree entry with sha:null removes the path.
	for (const path of deletions) {
		if (!files.some((f) => f.path === path)) tree.push({ path, mode: BLOB_MODE, type: 'blob', sha: null });
	}

	const newTree = await client.request<{ sha: string }>(`${base}/git/trees`, {
		method: 'POST',
		body: { base_tree: baseTreeSha, tree },
	});
	const commit = await client.request<{ sha: string }>(`${base}/git/commits`, {
		method: 'POST',
		body: { message, tree: newTree.data.sha, parents: [headSha] },
	});
	await client.request(`${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.data.sha } });
	return commit.data.sha;
}
