// GitHubTarget publishes user data and a verified, version-matched runtime in one
// atomic commit. Existing live sites remain untouched until their owner publishes.
import { compressImage, imageTypeFromName } from '../compressImage';
import type { Content } from '../../../lib/content';
import type { PortfolioBundle, PublishProgress, PublishResult, PublishTarget } from '../exporter';
import { contentJsonString } from '../exporter';
import { GitHubClient } from './client';
import { CONTENT_JSON_PATH, TEMPLATE_REPO } from './config';
import { CommitHeadChangedError, commitFiles, type CommitFile } from './gitdata';
import {
	generateFromTemplate,
	findRecoverableTemplateRepo,
	getRepo,
	getRepoSnapshot,
	waitForRepoTree,
	getTreeAt,
	getPagesInfo,
	listAssetPaths,
	enablePages,
	setCustomDomain,
	pagesUrl,
	type RepoRef,
	type TreeItem,
} from './repo';
import {
	CURRENT_RUNTIME_RELEASE,
	PublishConflictError,
	fetchRuntimeFiles,
	managedFileConflicts,
	projectMetadataFile,
	projectMetadataForPublish,
	readProjectMetadata,
	removedManagedFiles,
	type ProjectMetadata,
	type RuntimeRelease,
} from './runtime';
import type { RepoStore } from './store';

export interface GitHubTargetOptions {
	client: GitHubClient;
	/** The authenticated user's login — the account that will own the repo. */
	login: string;
	store: RepoStore;
	/** Required only on the first publish (when no repo exists yet). */
	desiredRepoName?: string;
	/** Explicit second-step approval after a managed-file conflict. */
	forceRuntimeUpgrade?: boolean;
	/** Injectable for compatibility tests; production uses the pinned build release. */
	runtimeRelease?: RuntimeRelease;
	/**
	 * Reserve the site's default address ([name].hangwork.art) for this account and
	 * return the full domain, or null if it can't be had.
	 */
	claimAddress?: (name: string) => Promise<string | null>;
}

function dataFileShas(tree: TreeItem[], publicPaths: Iterable<string> = []): Record<string, string> {
	const publicSet = new Set(publicPaths);
	return Object.fromEntries(
		tree
			.filter(
				(item) =>
					item.path === CONTENT_JSON_PATH || item.path.startsWith('src/assets/') || publicSet.has(item.path),
			)
			.map((item) => [item.path, item.sha]),
	);
}

function changedPaths(before: Record<string, string>, after: Record<string, string>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])]
		.filter((path) => before[path] !== after[path])
		.sort();
}

function dedupeFiles(files: CommitFile[]): CommitFile[] {
	const byPath = new Map<string, CommitFile>();
	for (const file of files) byPath.set(file.path, file);
	return [...byPath.values()];
}

function referencedAssetPaths(content: Content): string[] {
	const paths: string[] = [];
	if (content.profile.image) paths.push(`src/assets/${content.profile.image}`);
	if (content.site.logoImage) paths.push(`src/assets/${content.site.logoImage}`);
	for (const page of Object.values(content.pages)) if (page.thumbnail) paths.push(`src/assets/${page.thumbnail}`);
	for (const product of content.store?.products ?? [])
		if (product.status !== 'draft' && product.image) paths.push(`src/assets/${product.image}`);
	for (const font of content.theme.customFonts ?? []) paths.push(`src/assets/${font.file}`);
	for (const [folder, gallery] of Object.entries(content.galleries))
		for (const filename of Object.keys(gallery.items)) paths.push(`src/assets/${folder}/${filename}`);
	const resume = content.resume?.url.trim();
	if (resume && !resume.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(resume))
		paths.push(`public/${resume.replace(/^\/+/, '')}`);
	return paths;
}

export class GitHubTarget implements PublishTarget {
	constructor(private opts: GitHubTargetOptions) {}

	async publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult> {
		const { client, login, store } = this.opts;
		const release = this.opts.runtimeRelease ?? CURRENT_RUNTIME_RELEASE;
		const report = (step: string, detail?: string) => onProgress?.({ step, detail });

		report('Connecting to GitHub…');
		const saved = store.load();
		let ref: RepoRef | null = saved ? await getRepo(client, saved.owner, saved.repo) : null;
		const firstPublish = ref === null;

		if (!ref) {
			const name = this.opts.desiredRepoName?.trim();
			if (!name) throw new Error('A website name is required for the first publish.');
			ref = await findRecoverableTemplateRepo(client, login, name);
			if (ref) report('Finishing your space…', name);
			else {
				report('Creating your space…', name);
				ref = await generateFromTemplate(client, login, name);
			}
		}
		if (ref.owner === TEMPLATE_REPO.owner && ref.repo === TEMPLATE_REPO.repo)
			throw new Error('This name belongs to the template itself — pick a different website name.');

		const snapshot = firstPublish ? await waitForRepoTree(client, ref) : await getRepoSnapshot(client, ref);
		const previousCommitSha = snapshot.headSha;
		let currentProject: ProjectMetadata | null = null;

		if (!firstPublish) {
			currentProject = await readProjectMetadata(client, ref, snapshot.tree);

			// The branch may contain unrelated, user-owned files. Only content/assets from
			// the editor's last snapshot are concurrency-sensitive.
			if (saved?.lastCommitSha && saved.lastCommitSha !== snapshot.headSha) {
				if (!saved.dataFileShas) {
					throw new PublishConflictError(
						'external-data-change',
						'This site changed on GitHub since this browser last loaded it. Reopen the published site before publishing so no newer content is overwritten.',
					);
				}
				const priorPublic = Object.keys(saved.dataFileShas).filter((path) => path.startsWith('public/'));
				const changedData = changedPaths(saved.dataFileShas, dataFileShas(snapshot.tree, priorPublic));
				if (changedData.length) {
					throw new PublishConflictError(
						'external-data-change',
						'This site’s content or uploads changed on GitHub. Reopen the published site before publishing so those changes are not lost.',
						changedData,
					);
				}
			} else if (!saved?.lastCommitSha) {
				throw new PublishConflictError(
					'external-data-change',
					'This browser has no safe repository snapshot for the existing site. Reopen the published site once, then publish your changes.',
				);
			}

			const conflicts = managedFileConflicts(snapshot.tree, currentProject);
			if (conflicts.length && !this.opts.forceRuntimeUpgrade) {
				throw new PublishConflictError(
					'managed-file-change',
					'System files were edited outside Hangwork. They were preserved. Review the listed files, or explicitly replace them with the compatible release and publish again.',
					conflicts,
				);
			}
		}

		let domain = (await getPagesInfo(client, ref))?.cname ?? null;
		let claimedDomain: string | null = null;
		if (firstPublish && !domain && this.opts.claimAddress) {
			report('Claiming your web address…', ref.repo);
			claimedDomain = await this.opts.claimAddress(ref.repo).catch(() => null);
			if (claimedDomain) domain = claimedDomain;
		}
		const siteUrl = domain ? `https://${domain}` : `https://${ref.owner}.github.io`;
		const basePath = domain ? '/' : `/${ref.repo}`;

		report('Updating the site engine…', release.version);
		const runtime = await fetchRuntimeFiles(client, release);
		let project = projectMetadataForPublish(currentProject, {
			release,
			managedFiles: runtime.managedFiles,
			siteUrl,
			basePath,
		});

		let files: CommitFile[] = dedupeFiles([
			...runtime.files,
			{ path: CONTENT_JSON_PATH, text: contentJsonString(bundle.contentJson) },
			...bundle.files.map((file) => ({ path: file.path, bytes: file.bytes })),
			projectMetadataFile(project),
		]);

		const MAX_BLOB_BYTES = 18 * 1024 * 1024;
		const oversized: string[] = [];
		for (const file of files) {
			if (!file.bytes || file.bytes.length <= MAX_BLOB_BYTES) continue;
			const name = file.path.split('/').pop() ?? file.path;
			const type = imageTypeFromName(name);
			const shrunk = type
				? await compressImage(new File([new Uint8Array(file.bytes)], name, { type }), { keepType: true })
				: null;
			if (shrunk && shrunk.size <= MAX_BLOB_BYTES) file.bytes = new Uint8Array(await shrunk.arrayBuffer());
			else oversized.push(name);
		}
		if (oversized.length) {
			throw new Error(
				`Too large to publish: ${oversized.join(', ')}. GitHub can't accept files over ${MAX_BLOB_BYTES / (1024 * 1024)} MB — please use a smaller version.`,
			);
		}

		const referencedAssets = referencedAssetPaths(bundle.contentJson);
		const emittedPaths = new Set(bundle.files.map((file) => file.path));
		const existingPaths = new Set(snapshot.tree.map((item) => item.path));
		const missingReferences = referencedAssets.filter(
			(path) => !emittedPaths.has(path) && !existingPaths.has(path),
		);
		if (missingReferences.length) {
			throw new Error(
				`Missing from this browser and GitHub: ${missingReferences
					.map((path) => path.split('/').pop() ?? path)
					.join(', ')}. Re-upload ${missingReferences.length === 1 ? 'it' : 'them'} before publishing.`,
			);
		}
		const keep = new Set(files.map((file) => file.path));
		for (const path of referencedAssets) keep.add(path);
		const assetDeletions = (await listAssetPaths(client, ref, snapshot.tree)).filter((path) => !keep.has(path));
		const previousPublic = (saved?.lastManifest ?? []).filter((path) => path.startsWith('public/'));
		const dataDeletions = previousPublic.filter((path) => !keep.has(path));
		const runtimeDeletions = removedManagedFiles(currentProject, runtime.managedFiles);
		const deletions = [...new Set([...assetDeletions, ...dataDeletions, ...runtimeDeletions])];
		const newManifest = [...new Set([CONTENT_JSON_PATH, ...bundle.files.map((file) => file.path), ...referencedAssets])];

		report('Uploading your files…', `1 of ${files.length}`);
		let commitSha: string;
		try {
			commitSha = await commitFiles(
				client,
				{
					owner: ref.owner,
					repo: ref.repo,
					branch: ref.branch,
					message: firstPublish ? 'Publish portfolio' : `Update portfolio and runtime ${release.version}`,
					files,
					deletions,
					expectedHeadSha: snapshot.headSha,
				},
				(done, total) =>
					report(done < total ? 'Uploading your files…' : 'Saving your changes…', `${Math.min(done + 1, total)} of ${total}`),
			);
		} catch (error) {
			if (error instanceof CommitHeadChangedError) {
				throw new PublishConflictError(
					'concurrent-update',
					'The repository changed while publishing was being prepared. Nothing was committed; reopen the published site and try again.',
				);
			}
			throw error;
		}

		report('Publishing your website…');
		await enablePages(client, ref);

		// GitHub must accept the claimed Pages domain after the commit. If it does not,
		// restore a working github.io address in a second atomic metadata-only commit.
		if (claimedDomain) {
			try {
				await setCustomDomain(client, ref, claimedDomain);
			} catch {
				domain = null;
				project = projectMetadataForPublish(project, {
					release,
					managedFiles: runtime.managedFiles,
					siteUrl: `https://${ref.owner}.github.io`,
					basePath: `/${ref.repo}`,
				});
				commitSha = await commitFiles(client, {
					owner: ref.owner,
					repo: ref.repo,
					branch: ref.branch,
					message: 'Use the github.io address',
					files: [projectMetadataFile(project)],
					expectedHeadSha: commitSha,
				});
			}
		}

		const finalTree = await getTreeAt(client, ref, commitSha);
		const publicPaths = newManifest.filter((path) => path.startsWith('public/'));
		const url = domain ? `https://${domain}/` : pagesUrl(ref.owner, ref.repo);
		store.save({
			owner: ref.owner,
			repo: ref.repo,
			branch: ref.branch,
			pagesUrl: url,
			customDomain: domain ?? undefined,
			lastManifest: newManifest,
			lastCommitSha: commitSha,
			runtimeVersion: release.version,
			dataFileShas: dataFileShas(finalTree, publicPaths),
		});

		return {
			url,
			repoUrl: `https://github.com/${ref.owner}/${ref.repo}`,
			owner: ref.owner,
			repo: ref.repo,
			commitSha,
			previousCommitSha,
			runtimeVersion: release.version,
		};
	}
}
