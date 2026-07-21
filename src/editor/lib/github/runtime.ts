import { z } from 'zod';
import bundledProject from '../../../../.hangwork/project.json';
import bundledRelease from '../../../../.hangwork/runtime-release.json';
import { base64ToBytes } from './base64';
import type { GitHubClient } from './client';
import { TEMPLATE_REPO } from './config';
import { commitFiles, type CommitFile } from './gitdata';
import { getRepoSnapshot, getTree, getTreeAt, type RepoRef, type TreeItem } from './repo';

export const PROJECT_METADATA_PATH = '.hangwork/project.json';
export const RUNTIME_RELEASE_PATH = '.hangwork/runtime-release.json';
export const PROJECT_FORMAT_VERSION = 1 as const;

const digestSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), gitBlobSha: z.string().regex(/^[a-f0-9]{40}$/) });
const digestMapSchema = z.record(z.string(), digestSchema);
const runtimeManifestSchema = z.object({
	formatVersion: z.literal(1),
	version: z.string().min(1),
	files: digestMapSchema,
});
const projectMetadataSchema = z
	.looseObject({
		formatVersion: z.literal(PROJECT_FORMAT_VERSION),
		runtimeVersion: z.string().min(1),
		sourceCommit: z.string().min(1),
		siteUrl: z.url(),
		basePath: z.string(),
		isProductSite: z.boolean(),
		managedFiles: digestMapSchema,
	});

export interface FileDigest {
	sha256: string;
	gitBlobSha: string;
}

export interface RuntimeManifest {
	formatVersion: 1;
	version: string;
	files: Record<string, FileDigest>;
}

export interface RuntimeRelease extends RuntimeManifest {
	sourceCommit: string;
}

export interface ProjectMetadata {
	formatVersion: 1;
	runtimeVersion: string;
	sourceCommit: string;
	siteUrl: string;
	basePath: string;
	isProductSite: boolean;
	managedFiles: Record<string, FileDigest>;
	[key: string]: unknown;
}

export type PublishConflictKind =
	| 'external-data-change'
	| 'managed-file-change'
	| 'unsupported-runtime'
	| 'concurrent-update'
	| 'runtime-not-released';

export class PublishConflictError extends Error {
	constructor(
		public readonly kind: PublishConflictKind,
		message: string,
		public readonly paths: string[] = [],
	) {
		super(message);
		this.name = 'PublishConflictError';
	}
}

const parsedBundledRelease = runtimeManifestSchema.parse(bundledRelease) as RuntimeManifest;
const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const buildCommit = runtimeEnv?.PUBLIC_HANGWORK_RUNTIME_COMMIT || bundledProject.sourceCommit;

export const CURRENT_RUNTIME_RELEASE: RuntimeRelease = {
	...parsedBundledRelease,
	sourceCommit: buildCommit,
};

export function assertPinnedRuntimeRelease(release: RuntimeRelease): void {
	if (!/^[a-f0-9]{40}$/i.test(release.sourceCommit)) {
		throw new PublishConflictError(
			'runtime-not-released',
			'This editor build is not pinned to a released source commit, so it cannot safely upgrade a live site. Use the deployed editor or set HANGWORK_RUNTIME_COMMIT to the exact 40-character commit when building.',
		);
	}
}

export async function sha256(bytes: Uint8Array): Promise<string> {
	const copy = Uint8Array.from(bytes);
	const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
	return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

/** GitHub tree entries use the Git blob object id. Reproducing it lets tests and
 * generated metadata verify the same bytes without another API request. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
	const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
	const joined = new Uint8Array(header.length + bytes.length);
	joined.set(header);
	joined.set(bytes, header.length);
	const digest = await crypto.subtle.digest('SHA-1', joined.buffer);
	return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function digestBytes(bytes: Uint8Array): Promise<FileDigest> {
	return { sha256: await sha256(bytes), gitBlobSha: await gitBlobSha(bytes) };
}

export function serializeProjectMetadata(metadata: ProjectMetadata): string {
	return `${JSON.stringify(metadata, null, 2)}\n`;
}

export function parseProjectMetadata(raw: unknown): ProjectMetadata {
	const result = projectMetadataSchema.safeParse(raw);
	if (!result.success) {
		throw new PublishConflictError(
			'unsupported-runtime',
			'This published site predates safe automatic upgrades or has invalid project metadata. Open the site from the latest editor before publishing again.',
			[PROJECT_METADATA_PATH],
		);
	}
	return result.data as ProjectMetadata;
}

async function readBlob(client: GitHubClient, ref: Pick<RepoRef, 'owner' | 'repo'>, sha: string): Promise<Uint8Array> {
	const { data } = await client.request<{ content: string }>(`/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`);
	return base64ToBytes(data.content);
}

export async function readProjectMetadata(
	client: GitHubClient,
	ref: RepoRef,
	tree?: TreeItem[],
): Promise<ProjectMetadata> {
	const entries = tree ?? (await getTree(client, ref));
	const item = entries.find((entry) => entry.path === PROJECT_METADATA_PATH);
	if (!item) return parseProjectMetadata(null);
	const bytes = await readBlob(client, ref, item.sha);
	let raw: unknown;
	try {
		raw = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return parseProjectMetadata(null);
	}
	return parseProjectMetadata(raw);
}

function sameManifest(a: RuntimeManifest, b: RuntimeManifest): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export interface RuntimeFiles {
	files: CommitFile[];
	managedFiles: Record<string, FileDigest>;
}

/** Fetch every declared system file from one exact commit and verify each byte before
 * it can enter a user's repository. Files come one blob at a time through the Git Data
 * API because the zipball endpoint redirects to codeload.github.com, which browsers
 * cannot read cross-origin. */
export async function fetchRuntimeFiles(
	client: GitHubClient,
	release: RuntimeRelease = CURRENT_RUNTIME_RELEASE,
): Promise<RuntimeFiles> {
	assertPinnedRuntimeRelease(release);
	const tree = await getTreeAt(client, TEMPLATE_REPO, release.sourceCommit);
	const shaByPath = new Map(tree.map((entry) => [entry.path, entry.sha]));

	const manifestSha = shaByPath.get(RUNTIME_RELEASE_PATH);
	if (!manifestSha) throw new Error(`The pinned source commit is missing ${RUNTIME_RELEASE_PATH}.`);
	const manifestBytes = await readBlob(client, TEMPLATE_REPO, manifestSha);

	let sourceManifest: RuntimeManifest;
	try {
		sourceManifest = runtimeManifestSchema.parse(JSON.parse(new TextDecoder().decode(manifestBytes))) as RuntimeManifest;
	} catch {
		throw new Error('The pinned runtime release manifest is invalid.');
	}
	const projection: RuntimeManifest = {
		formatVersion: release.formatVersion,
		version: release.version,
		files: release.files,
	};
	if (
		(release === CURRENT_RUNTIME_RELEASE && !sameManifest(sourceManifest, parsedBundledRelease)) ||
		!sameManifest(sourceManifest, projection)
	)
		throw new Error('The editor runtime manifest does not match its pinned source commit.');

	const entries = Object.entries(release.files);
	for (const [path, expected] of entries) {
		const treeSha = shaByPath.get(path);
		if (!treeSha) throw new Error(`The pinned source commit is missing ${path}.`);
		if (treeSha !== expected.gitBlobSha) throw new Error(`Runtime integrity check failed for ${path}.`);
	}

	const files: CommitFile[] = new Array(entries.length);
	let nextEntry = 0;
	const fetchNextBlob = async (): Promise<void> => {
		while (nextEntry < entries.length) {
			const index = nextEntry++;
			const [path, expected] = entries[index];
			const contents = await readBlob(client, TEMPLATE_REPO, expected.gitBlobSha);
			if ((await sha256(contents)) !== expected.sha256 || (await gitBlobSha(contents)) !== expected.gitBlobSha)
				throw new Error(`Runtime integrity check failed for ${path}.`);
			files[index] = { path, bytes: contents };
		}
	};
	await Promise.all(Array.from({ length: Math.min(8, entries.length) }, fetchNextBlob));

	const manifestDigest = await digestBytes(manifestBytes);
	return {
		files: [...files, { path: RUNTIME_RELEASE_PATH, bytes: manifestBytes }],
		managedFiles: { ...release.files, [RUNTIME_RELEASE_PATH]: manifestDigest },
	};
}

export function managedFileConflicts(tree: TreeItem[], metadata: ProjectMetadata): string[] {
	const shaByPath = new Map(tree.map((entry) => [entry.path, entry.sha]));
	return Object.entries(metadata.managedFiles)
		.filter(([path, expected]) => shaByPath.get(path) !== expected.gitBlobSha)
		.map(([path]) => path)
		.sort();
}

export function removedManagedFiles(
	current: ProjectMetadata | null,
	nextManagedFiles: Record<string, FileDigest>,
): string[] {
	return current ? Object.keys(current.managedFiles).filter((path) => !(path in nextManagedFiles)).sort() : [];
}

export function projectMetadataForPublish(
	current: ProjectMetadata | null,
	args: { release: RuntimeRelease; managedFiles: Record<string, FileDigest>; siteUrl: string; basePath: string },
): ProjectMetadata {
	return {
		...(current ?? {}),
		formatVersion: PROJECT_FORMAT_VERSION,
		runtimeVersion: args.release.version,
		sourceCommit: args.release.sourceCommit,
		siteUrl: args.siteUrl,
		basePath: args.basePath,
		isProductSite: false,
		managedFiles: args.managedFiles,
	};
}

export function projectMetadataFile(metadata: ProjectMetadata): CommitFile {
	return { path: PROJECT_METADATA_PATH, text: serializeProjectMetadata(metadata) };
}

export async function commitProjectLocation(
	client: GitHubClient,
	ref: RepoRef,
	location: { siteUrl: string; basePath: string },
	message: string,
): Promise<{ commitSha: string; metadata: ProjectMetadata; changed: boolean }> {
	const snapshot = await getRepoSnapshot(client, ref);
	const current = await readProjectMetadata(client, ref, snapshot.tree);
	const metadata: ProjectMetadata = { ...current, ...location };
	if (current.siteUrl === location.siteUrl && current.basePath === location.basePath)
		return { commitSha: snapshot.headSha, metadata, changed: false };
	const commitSha = await commitFiles(client, {
		owner: ref.owner,
		repo: ref.repo,
		branch: ref.branch,
		message,
		files: [projectMetadataFile(metadata)],
		expectedHeadSha: snapshot.headSha,
	});
	return { commitSha, metadata, changed: true };
}
