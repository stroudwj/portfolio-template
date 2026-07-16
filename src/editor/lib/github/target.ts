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
	readAstroConfig,
	rewriteSiteAndBase,
	listAssetPaths,
	enablePages,
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
	constructor(private opts: GitHubTargetOptions) {}

	async publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult> {
		const { client, login, store } = this.opts;
		const report = (step: string, detail?: string) => onProgress?.({ step, detail });

		report('Connecting to GitHub…');
		const saved = store.load();

		// Resolve the target repo: reuse the saved one, or create it from the template.
		let ref: RepoRef | null = saved ? await getRepo(client, saved.owner, saved.repo) : null;
		const firstPublish = ref === null;

		if (!ref) {
			const name = this.opts.desiredRepoName?.trim();
			if (!name) throw new Error('A repository name is required for the first publish.');
			report('Creating your repository…', name);
			ref = await generateFromTemplate(client, login, name);
		}

		// Make sure astro.config's site/base point at THIS repo's Pages URL, or nav links
		// and image URLs resolve under the wrong path. Idempotent + only committed when it
		// actually changes, so it self-heals a repo published before this was correct.
		const currentConfig = await readAstroConfig(client, ref);
		const desiredConfig = rewriteSiteAndBase(currentConfig, ref.owner, ref.repo);
		const configFile: CommitFile | null =
			desiredConfig !== currentConfig ? { path: ASTRO_CONFIG_PATH, text: desiredConfig } : null;

		// Assemble the files for this commit.
		const files: CommitFile[] = [{ path: CONTENT_JSON_PATH, text: contentJsonString(bundle.contentJson) }];
		for (const f of bundle.files) files.push({ path: f.path, bytes: f.bytes });
		if (configFile) files.push(configFile);

		// The editor fully owns src/assets/: whatever it isn't writing shouldn't be there.
		// This removes the template's placeholder.png files (and any image deleted in the
		// editor) — but we always KEEP the file content.json points at, so an unset profile
		// picture (which still references the template placeholder) doesn't 404.
		const keep = new Set(files.map((f) => f.path));
		if (bundle.contentJson.profile.image) keep.add(`src/assets/${bundle.contentJson.profile.image}`);
		const deletions = (await listAssetPaths(client, ref)).filter((p) => !keep.has(p));
		const newManifest = [CONTENT_JSON_PATH, ...bundle.files.map((f) => f.path)];

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

		// Don't block on the Pages build (the first one takes 1–2 min): the commit is done and Pages
		// is enabled, so the site will go live shortly. The success screen tells the user to give a
		// brand-new site a minute. Subsequent edits publish just as fast.
		const url = pagesUrl(ref.owner, ref.repo);
		store.save({ owner: ref.owner, repo: ref.repo, branch: ref.branch, pagesUrl: url, lastManifest: newManifest });

		return { url, repoUrl: `https://github.com/${ref.owner}/${ref.repo}` };
	}
}
