// GitHubTarget: the PublishTarget that turns a bundle into a live website. It creates
// the repo the first time, then updates it on every later publish — the editor only ever
// calls target.publish(bundle, onProgress) and never learns any of this.
import type { PortfolioBundle, PublishProgress, PublishResult, PublishTarget } from '../exporter';
import { contentJsonString } from '../exporter';
import { GitHubClient } from './client';
import { CONTENT_JSON_PATH, ASTRO_CONFIG_PATH } from './config';
import { commitFiles, type CommitFile } from './gitdata';
import {
	generateFromTemplate,
	getRepo,
	patchedAstroConfig,
	enablePages,
	waitForPages,
	pagesUrl,
	type RepoRef,
} from './repo';
import type { RepoStore } from './store';

export interface GitHubTargetOptions {
	client: GitHubClient;
	/** The authenticated user's login — the account that will own the repo. */
	login: string;
	store: RepoStore;
	/** Required only on the first publish (when no repo exists yet). */
	desiredRepoName?: string;
}

export class GitHubTarget implements PublishTarget {
	readonly name = 'Publish to GitHub';

	constructor(private opts: GitHubTargetOptions) {}

	async publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult> {
		const { client, login, store } = this.opts;
		const report = (step: string, detail?: string) => onProgress?.({ step, detail });

		report('Connecting to GitHub…');
		const saved = store.load();

		// Resolve the target repo: reuse the saved one, or create it from the template.
		let ref: RepoRef | null = saved ? await getRepo(client, saved.owner, saved.repo) : null;
		const firstPublish = ref === null;
		let configFile: CommitFile | null = null;

		if (!ref) {
			const name = this.opts.desiredRepoName?.trim();
			if (!name) throw new Error('A repository name is required for the first publish.');
			report('Creating your repository…', name);
			ref = await generateFromTemplate(client, login, name);
			// Rewrite site/base for the new URL (also confirms the repo is populated).
			configFile = { path: ASTRO_CONFIG_PATH, text: await patchedAstroConfig(client, ref) };
		}

		// Assemble the files for this commit and the manifest we'll diff against next time.
		const files: CommitFile[] = [{ path: CONTENT_JSON_PATH, text: contentJsonString(bundle.contentJson) }];
		for (const f of bundle.files) files.push({ path: f.path, bytes: f.bytes });
		if (configFile) files.push(configFile);

		// astro.config.mjs is a one-time write, not lifecycle content — keep it out of the
		// manifest so a later publish never tries to delete it.
		const newManifest = [CONTENT_JSON_PATH, ...bundle.files.map((f) => f.path)];
		// Only an update prunes files; a freshly created repo has nothing of ours to delete.
		const deletions = firstPublish ? [] : (saved?.lastManifest ?? []).filter((p) => !newManifest.includes(p));

		report('Uploading your images…', `0 of ${files.length}`);
		await commitFiles(
			client,
			{
				owner: ref.owner,
				repo: ref.repo,
				branch: ref.branch,
				message: firstPublish ? 'Publish portfolio' : 'Update portfolio',
				files,
				deletions,
			},
			(done, total) => report(done < total ? 'Uploading your images…' : 'Saving your changes…', `${done} of ${total}`),
		);

		report('Publishing your website…');
		await enablePages(client, ref);
		const pages = await waitForPages(client, ref);

		const url = pages.url || pagesUrl(ref.owner, ref.repo);
		store.save({ owner: ref.owner, repo: ref.repo, branch: ref.branch, pagesUrl: url, lastManifest: newManifest });

		return { url, repoUrl: `https://github.com/${ref.owner}/${ref.repo}` };
	}
}
