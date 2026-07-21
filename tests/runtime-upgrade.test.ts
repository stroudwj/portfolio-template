import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/editor/lib/github/client';
import { CommitHeadChangedError, commitFiles } from '../src/editor/lib/github/gitdata';
import {
	PROJECT_METADATA_PATH,
	RUNTIME_RELEASE_PATH,
	digestBytes,
	fetchRuntimeFiles,
	managedFileConflicts,
	parseProjectMetadata,
	projectMetadataForPublish,
	removedManagedFiles,
	type ProjectMetadata,
	type RuntimeRelease,
} from '../src/editor/lib/github/runtime';

function digest(value: string) {
	const bytes = Buffer.from(value);
	const header = Buffer.from(`blob ${bytes.length}\0`);
	return {
		sha256: createHash('sha256').update(bytes).digest('hex'),
		gitBlobSha: createHash('sha1').update(header).update(bytes).digest('hex'),
	};
}

describe('runtime release integrity', () => {
	it('verifies a pinned archive and produces project-managed files', async () => {
		const source = 'export const compatible = true;\n';
		const release: RuntimeRelease = {
			formatVersion: 1,
			version: '9.0.0-test',
			sourceCommit: 'a'.repeat(40),
			files: { 'src/runtime.ts': digest(source) },
		};
		const manifest = `${JSON.stringify({ formatVersion: 1, version: release.version, files: release.files }, null, 2)}\n`;
		const zip = zipSync({
			'owner-repo-sha/src/runtime.ts': strToU8(source),
			[`owner-repo-sha/${RUNTIME_RELEASE_PATH}`]: strToU8(manifest),
		});
		const client = { requestBytes: async () => zip } as unknown as GitHubClient;

		const result = await fetchRuntimeFiles(client, release);
		expect(result.files.map((file) => file.path)).toEqual(['src/runtime.ts', RUNTIME_RELEASE_PATH]);
		expect(result.managedFiles['src/runtime.ts']).toEqual(release.files['src/runtime.ts']);
		expect(result.managedFiles[RUNTIME_RELEASE_PATH]).toEqual(await digestBytes(strToU8(manifest)));
	});

	it('detects edited and missing system files from tree blob ids', () => {
		const metadata = parseProjectMetadata({
			formatVersion: 1,
			runtimeVersion: '1.0.0',
			sourceCommit: 'a'.repeat(40),
			siteUrl: 'https://example.com',
			basePath: '/',
			isProductSite: false,
			managedFiles: {
				'a.ts': { sha256: '0'.repeat(64), gitBlobSha: '1'.repeat(40) },
				'missing.ts': { sha256: '0'.repeat(64), gitBlobSha: '2'.repeat(40) },
			},
		});
		expect(managedFileConflicts([{ path: 'a.ts', type: 'blob', sha: '9'.repeat(40) }], metadata)).toEqual([
			'a.ts',
			'missing.ts',
		]);
	});

	it('identifies files retired by the next runtime without touching new files', () => {
		const current = parseProjectMetadata({
			formatVersion: 1,
			runtimeVersion: '1.0.0',
			sourceCommit: 'a'.repeat(40),
			siteUrl: 'https://example.com',
			basePath: '/',
			isProductSite: false,
			managedFiles: {
				'keep.ts': { sha256: '0'.repeat(64), gitBlobSha: '1'.repeat(40) },
				'retire.ts': { sha256: '2'.repeat(64), gitBlobSha: '3'.repeat(40) },
			},
		});
		expect(removedManagedFiles(current, { 'keep.ts': current.managedFiles['keep.ts'] })).toEqual(['retire.ts']);
	});

	it('creates published metadata without losing extension keys', () => {
		const current = {
			formatVersion: 1,
			runtimeVersion: '0.9.0',
			sourceCommit: 'b'.repeat(40),
			siteUrl: 'https://old.example',
			basePath: '/',
			isProductSite: false,
			managedFiles: {},
			extension: 'kept',
		} satisfies ProjectMetadata;
		const release: RuntimeRelease = { formatVersion: 1, version: '1.0.0', sourceCommit: 'a'.repeat(40), files: {} };
		const next = projectMetadataForPublish(current, {
			release,
			managedFiles: {},
			siteUrl: 'https://new.example',
			basePath: '/site',
		});
		expect(next).toMatchObject({ extension: 'kept', runtimeVersion: '1.0.0', isProductSite: false });
	});
});

describe('atomic commit concurrency', () => {
	it('aborts before creating blobs when the branch head changed', async () => {
		const calls: Array<{ path: string; method?: string }> = [];
		const client = {
			request: async (path: string, options?: { method?: string }) => {
				calls.push({ path, method: options?.method });
				return { status: 200, data: { object: { sha: 'actual-head' } } };
			},
		} as unknown as GitHubClient;

		await expect(
			commitFiles(client, {
				owner: 'owner',
				repo: 'repo',
				branch: 'main',
				message: 'test',
				files: [{ path: PROJECT_METADATA_PATH, text: '{}' }],
				expectedHeadSha: 'expected-head',
			}),
		).rejects.toBeInstanceOf(CommitHeadChangedError);
		expect(calls).toHaveLength(1);
		expect(calls.some((call) => call.method === 'POST' || call.method === 'PATCH')).toBe(false);
	});
});
