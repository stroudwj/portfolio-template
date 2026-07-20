// GitHubTarget: the PublishTarget that turns a bundle into a live website. It creates
// the repo the first time, then updates it on every later publish — the editor only ever
// calls target.publish(bundle, onProgress) and never learns any of this.
import { compressImage, imageTypeFromName } from '../compressImage';
import type { PortfolioBundle, PublishProgress, PublishResult, PublishTarget } from '../exporter';
import { contentJsonString } from '../exporter';
import { GitHubClient } from './client';
import { CONTENT_JSON_PATH, ASTRO_CONFIG_PATH, TEMPLATE_REPO, PRODUCT_SITE_FLAG_PATH, PRODUCT_SITE_FLAG_OFF } from './config';
import { commitFiles, type CommitFile } from './gitdata';
import {
	generateFromTemplate,
	getRepo,
	readAstroConfig,
	rewriteSiteAndBase,
	getPagesInfo,
	listAssetPaths,
	enablePages,
	setCustomDomain,
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
	/**
	 * Reserve the site's default address ([name].hangwork.art) for this account and
	 * return the full domain, or null if it can't be had (service down, name taken).
	 * Only consulted on the first publish; when absent or failing, the site publishes
	 * to the plain github.io URL exactly as before.
	 */
	claimAddress?: (name: string) => Promise<string | null>;
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
			if (!name) throw new Error('A website name is required for the first publish.');
			report('Creating your space…', name);
			ref = await generateFromTemplate(client, login, name);
		}

		// Publishing into the template repo itself would flip its product-site flag off and
		// replace the landing with a portfolio — only possible for the template's owner, but
		// catastrophic enough to hard-stop.
		if (ref.owner === TEMPLATE_REPO.owner && ref.repo === TEMPLATE_REPO.repo) {
			throw new Error('This name belongs to the template itself — pick a different website name.');
		}

		// Make sure astro.config's site/base point at this repo's Pages URL — or, when the
		// repo's Pages settings have a custom domain (set in the editor or manually on
		// GitHub), at that domain with base '/'. The Pages cname is the source of truth, so
		// a publish never clobbers a configured domain. Idempotent + only committed when it
		// actually changes, so it self-heals a repo published before this was correct.
		const currentConfig = await readAstroConfig(client, ref);
		let domain = (await getPagesInfo(client, ref))?.cname ?? null; // null = no Pages yet (first publish)

		// New sites default to [name].hangwork.art. Claim the DNS record BEFORE writing the
		// config so the publish commit already points at the final address (one build, not
		// two). A failed claim is not an error — the site just keeps its github.io URL.
		let claimedDomain: string | null = null;
		if (firstPublish && !domain && this.opts.claimAddress) {
			report('Claiming your web address…', ref.repo);
			claimedDomain = await this.opts.claimAddress(ref.repo).catch(() => null);
			if (claimedDomain) domain = claimedDomain;
		}

		const desiredConfig = domain
			? rewriteSiteAndBase(currentConfig, `https://${domain}`, '/')
			: rewriteSiteAndBase(currentConfig, `https://${ref.owner}.github.io`, `/${ref.repo}`);
		const configFile: CommitFile | null =
			desiredConfig !== currentConfig ? { path: ASTRO_CONFIG_PATH, text: desiredConfig } : null;

		// Assemble the files for this commit. The product-site flag is committed verbatim on
		// every publish (identical content = git no-op) so the published root is always the
		// owner's portfolio, never the template's sales landing.
		const files: CommitFile[] = [
			{ path: CONTENT_JSON_PATH, text: contentJsonString(bundle.contentJson) },
			{ path: PRODUCT_SITE_FLAG_PATH, text: PRODUCT_SITE_FLAG_OFF },
		];
		for (const f of bundle.files) files.push({ path: f.path, bytes: f.bytes });
		if (configFile) files.push(configFile);

		// GitHub's create-blob API rejects request bodies past ~25 MB (base64 inflates
		// files by a third) with an opaque "input was too large" error. Uploads are
		// compressed on the way in, but drafts saved before that existed can still hold
		// full camera photos — rescue those here, and fail with actionable names for
		// anything (huge GIFs) that can't be shrunk.
		const MAX_BLOB_BYTES = 18 * 1024 * 1024;
		const oversized: string[] = [];
		for (const f of files) {
			if (!f.bytes || f.bytes.length <= MAX_BLOB_BYTES) continue;
			const name = f.path.split('/').pop() ?? f.path;
			const type = imageTypeFromName(name);
			// keepType: content.json already references this exact file name.
			const shrunk = type
				? await compressImage(new File([new Uint8Array(f.bytes)], name, { type }), { keepType: true })
				: null;
			if (shrunk && shrunk.size <= MAX_BLOB_BYTES) {
				f.bytes = new Uint8Array(await shrunk.arrayBuffer());
			} else {
				oversized.push(name);
			}
		}
		if (oversized.length) {
			throw new Error(
				`Too large to publish: ${oversized.join(', ')}. GitHub can't accept files ` +
					`over ${MAX_BLOB_BYTES / (1024 * 1024)} MB — please use a smaller version.`,
			);
		}

		// The editor fully owns src/assets/: whatever it isn't writing shouldn't be there.
		// This removes the template's placeholder.png files (and any image deleted in the
		// editor) — but we always KEEP the files content.json points at (profile picture,
		// page thumbnails), so references loaded from the repo without re-upload don't 404.
		const keep = new Set(files.map((f) => f.path));
		if (bundle.contentJson.profile.image) keep.add(`src/assets/${bundle.contentJson.profile.image}`);
		for (const page of Object.values(bundle.contentJson.pages)) {
			if (page.thumbnail) keep.add(`src/assets/${page.thumbnail}`);
		}
		for (const font of bundle.contentJson.theme.customFonts ?? []) keep.add(`src/assets/${font.file}`);
		const deletions = (await listAssetPaths(client, ref)).filter((p) => !keep.has(p));
		const newManifest = [CONTENT_JSON_PATH, ...bundle.files.map((f) => f.path)];

		// `done` counts completed blob uploads; show the file currently uploading
		// (done + 1) so the counter reads "1 of N" … "N of N" instead of stopping
		// at "N-1 of N" before flipping to the saving step.
		report('Uploading your images…', `1 of ${files.length}`);
		let commitSha = await commitFiles(
			client,
			{
				owner: ref.owner,
				repo: ref.repo,
				branch: ref.branch,
				message: firstPublish ? 'Publish portfolio' : 'Update portfolio',
				files,
				deletions,
			},
			(done, total) =>
				report(
					done < total ? 'Uploading your images…' : 'Saving your changes…',
					`${Math.min(done + 1, total)} of ${total}`,
				),
		);

		report('Publishing your website…');
		await enablePages(client, ref);

		// Attach the claimed address to the Pages site (the cname is what makes GitHub
		// actually serve it, and it's the source of truth every later publish reads). If
		// GitHub refuses the domain, put the config back on github.io so the site's links
		// still resolve somewhere real.
		if (claimedDomain) {
			try {
				await setCustomDomain(client, ref, claimedDomain);
			} catch {
				domain = null;
				const reverted = rewriteSiteAndBase(desiredConfig, `https://${ref.owner}.github.io`, `/${ref.repo}`);
				commitSha = await commitFiles(client, {
					owner: ref.owner,
					repo: ref.repo,
					branch: ref.branch,
					message: 'Use the github.io address',
					files: [{ path: ASTRO_CONFIG_PATH, text: reverted }],
				});
			}
		}

		// Don't block on the Pages build (the first one takes 1–2 min): the commit is done and
		// Pages is enabled. Returning the commit sha lets the success screen poll the build and
		// show "building…" until the site is actually live, without holding up the publish.
		const url = domain ? `https://${domain}/` : pagesUrl(ref.owner, ref.repo);
		store.save({
			owner: ref.owner,
			repo: ref.repo,
			branch: ref.branch,
			pagesUrl: url,
			customDomain: domain ?? undefined,
			lastManifest: newManifest,
		});

		return { url, repoUrl: `https://github.com/${ref.owner}/${ref.repo}`, owner: ref.owner, repo: ref.repo, commitSha };
	}
}
