import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUrl } from '../src/editor/lib/validation';
import { GitHubError } from '../src/editor/lib/github/client';
import type { GitHubClient } from '../src/editor/lib/github/client';
import { findRecoverableTemplateRepo, getRepoNameStatus, waitForRepoTree } from '../src/editor/lib/github/repo';
import { isValidSiteName, sanitizeSiteNameInput, slugifySiteName } from '../src/editor/lib/github/subdomain';
import { safeHref, safeWebHref } from '../src/portfolio/safeHref';

describe('site-name editing', () => {
	it('keeps unfinished input editable without inventing fallback text', () => {
		expect(sanitizeSiteNameInput('')).toBe('');
		expect(sanitizeSiteNameInput('My Portfolio-')).toBe('my-portfolio-');
		expect(sanitizeSiteNameInput('My - Portfolio')).toBe('my-portfolio');
	});

	it('only accepts finished DNS-safe names', () => {
		expect(isValidSiteName('my-portfolio')).toBe(true);
		expect(isValidSiteName('')).toBe(false);
		expect(isValidSiteName('my-portfolio-')).toBe(false);
		expect(slugifySiteName('')).toBe('my-portfolio');
	});
});

describe('portfolio links', () => {
	it('turns a bare domain into an external HTTPS link', () => {
		expect(safeWebHref('example.com/work')).toBe('https://example.com/work');
		expect(safeHref('www.example.com/work')).toBe('https://www.example.com/work');
		expect(isUrl('example.com/work')).toBe(true);
	});

	it('keeps internal paths and blocks executable schemes', () => {
		expect(safeHref('/work')).toBe('/work');
		expect(safeHref('javascript:alert(1)')).toBeUndefined();
		expect(isUrl('javascript:alert(1)')).toBe(false);
	});
});

describe('GitHub template readiness', () => {
	afterEach(() => vi.useRealTimers());

	it('retries the temporary empty-repository response', async () => {
		vi.useFakeTimers();
		let headReads = 0;
		const client = {
			request: vi.fn(async (path: string) => {
				if (path.endsWith('/git/ref/heads/main')) {
					headReads += 1;
					if (headReads < 3) throw new GitHubError(409, 'GitHub error: Git Repository is empty.');
					return { status: 200, data: { object: { sha: 'ready-head' } } };
				}
				if (path.endsWith('/git/trees/ready-head?recursive=1')) {
					return { status: 200, data: { tree: [{ path: 'package.json', type: 'blob', sha: 'blob-sha' }] } };
				}
				throw new Error(`Unexpected request: ${path}`);
			}),
		} as unknown as GitHubClient;

		const pending = waitForRepoTree(client, { owner: 'owner', repo: 'site', branch: 'main' });
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			headSha: 'ready-head',
			tree: [{ path: 'package.json', type: 'blob', sha: 'blob-sha' }],
		});
		expect(headReads).toBe(3);
	});

	it('recovers an untouched repository left behind by a failed first publish', async () => {
		const client = {
			request: vi.fn(async (path: string) => {
				if (path === '/repos/owner/site') {
					return {
						status: 200,
						data: { default_branch: 'main', template_repository: { full_name: 'stroudwj/portfolio-template' } },
					};
				}
				if (path === '/repos/owner/site/commits?per_page=2') return { status: 200, data: [{ sha: 'template-commit' }] };
				throw new Error(`Unexpected request: ${path}`);
			}),
		} as unknown as GitHubClient;

		await expect(findRecoverableTemplateRepo(client, 'owner', 'site')).resolves.toEqual({ owner: 'owner', repo: 'site', branch: 'main' });
		await expect(getRepoNameStatus(client, 'owner', 'site')).resolves.toBe('recoverable');
	});

	it('does not adopt a repository with user commits', async () => {
		const client = {
			request: vi.fn(async (path: string) => {
				if (path === '/repos/owner/site') {
					return {
						status: 200,
						data: { default_branch: 'main', template_repository: { full_name: 'stroudwj/portfolio-template' } },
					};
				}
				if (path === '/repos/owner/site/commits?per_page=2') {
					return { status: 200, data: [{ sha: 'user-commit' }, { sha: 'template-commit' }] };
				}
				throw new Error(`Unexpected request: ${path}`);
			}),
		} as unknown as GitHubClient;

		await expect(findRecoverableTemplateRepo(client, 'owner', 'site')).resolves.toBeNull();
		await expect(getRepoNameStatus(client, 'owner', 'site')).resolves.toBe('taken');
	});
});
