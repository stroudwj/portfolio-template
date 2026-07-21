import { describe, expect, it } from 'vitest';
import { blankContent } from '../src/editor/lib/content-init';
import type { PortfolioBundle } from '../src/editor/lib/exporter';
import { GitHubClient } from '../src/editor/lib/github/client';
import { GitHubTarget } from '../src/editor/lib/github/target';
import { serializeProjectMetadata, type ProjectMetadata } from '../src/editor/lib/github/runtime';
import type { RepoInfo, RepoStore } from '../src/editor/lib/github/store';

function base64(value: string): string {
	return Buffer.from(value).toString('base64');
}

function store(info: RepoInfo): RepoStore {
	return { load: () => info, save: () => undefined };
}

function fakeClient(args: { tree: Array<{ path: string; type: string; sha: string }>; project: ProjectMetadata }) {
	const writes: string[] = [];
	const client = {
		request: async (path: string, options?: { method?: string }) => {
			if (options?.method === 'POST' || options?.method === 'PATCH') writes.push(path);
			if (path === '/repos/owner/site') return { status: 200, data: { default_branch: 'main' } };
			if (path.endsWith('/git/ref/heads/main')) return { status: 200, data: { object: { sha: 'current-head' } } };
			if (path.endsWith('/git/trees/current-head?recursive=1')) return { status: 200, data: { tree: args.tree } };
			if (path.endsWith('/git/blobs/project-sha'))
				return { status: 200, data: { content: base64(serializeProjectMetadata(args.project)) } };
			throw new Error(`Unexpected request: ${path}`);
		},
	} as unknown as GitHubClient;
	return { client, writes };
}

const bundle: PortfolioBundle = { contentJson: blankContent, files: [] };

function project(): ProjectMetadata {
	return {
		formatVersion: 1,
		runtimeVersion: '1.0.0',
		sourceCommit: 'a'.repeat(40),
		siteUrl: 'https://owner.github.io',
		basePath: '/site',
		isProductSite: false,
		managedFiles: { 'src/system.ts': { sha256: '0'.repeat(64), gitBlobSha: '1'.repeat(40) } },
	};
}

describe('publish preflight', () => {
	it('preserves manually edited system files and performs zero writes', async () => {
		const info: RepoInfo = {
			owner: 'owner', repo: 'site', branch: 'main', lastManifest: [], lastCommitSha: 'current-head', dataFileShas: {},
		};
		const { client, writes } = fakeClient({
			project: project(),
			tree: [
				{ path: '.hangwork/project.json', type: 'blob', sha: 'project-sha' },
				{ path: 'src/system.ts', type: 'blob', sha: '9'.repeat(40) },
			],
		});
		const target = new GitHubTarget({ client, login: 'owner', store: store(info) });

		await expect(target.publish(bundle)).rejects.toMatchObject({
			kind: 'managed-file-change', paths: ['src/system.ts'],
		});
		expect(writes).toEqual([]);
	});

	it('stops on externally changed user data and performs zero writes', async () => {
		const info: RepoInfo = {
			owner: 'owner',
			repo: 'site',
			branch: 'main',
			lastManifest: ['src/data/content.json'],
			lastCommitSha: 'previous-head',
			dataFileShas: { 'src/data/content.json': 'old-content-sha' },
		};
		const { client, writes } = fakeClient({
			project: project(),
			tree: [
				{ path: '.hangwork/project.json', type: 'blob', sha: 'project-sha' },
				{ path: 'src/system.ts', type: 'blob', sha: '1'.repeat(40) },
				{ path: 'src/data/content.json', type: 'blob', sha: 'new-content-sha' },
			],
		});
		const target = new GitHubTarget({ client, login: 'owner', store: store(info) });

		await expect(target.publish(bundle)).rejects.toMatchObject({
			kind: 'external-data-change', paths: ['src/data/content.json'],
		});
		expect(writes).toEqual([]);
	});
});
