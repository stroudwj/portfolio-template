// The reverse of publishing: pull a live portfolio back into the editor so it can be
// edited from any browser or device. Reads content.json + every image under src/assets/
// from the repo and rebuilds the EditorDoc — the same shape StartScreen would create
// from a fresh upload, but with the real pixels wired in.
//
// Why this can't just parse content.json: the exporter only records an image in
// content.json when it has caption metadata; the *file* is always written. So gallery
// membership and order live in the file list (NN- prefixes give the order), and
// content.json only supplies optional captions on top.
import type { GitHubClient } from './client';
import { CONTENT_JSON_PATH, TEMPLATE_REPO } from './config';
import { getRepo, getTree, type RepoRef, type TreeItem } from './repo';
import type { Content, EditorDoc, ImageEntry } from '../types';
import type { PublishProgress } from '../exporter';
import { initDocFromContent } from '../content-init';
import { registerAsset, uid } from '../assets';
import { base64ToBytes } from './base64';

/** Read a blob's raw bytes by sha. The Blobs API base64-encodes files of any size. */
export async function readBlobBytes(client: GitHubClient, ref: RepoRef, sha: string): Promise<Uint8Array> {
	const { data } = await client.request<{ content: string; encoding: string }>(
		`/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`,
	);
	return base64ToBytes(data.content);
}

/** Drop a single leading order prefix ("03-photo.jpg" -> "photo.jpg") so a re-publish
 *  re-applies exactly one prefix instead of stacking "03-03-…" every round trip. */
export function stripOrderPrefix(name: string): string {
	return name.replace(/^\d+-/, '');
}

function mimeFromName(name: string): string {
	const ext = name.toLowerCase().split('.').pop() ?? '';
	const map: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		svg: 'image/svg+xml',
		woff2: 'font/woff2',
		woff: 'font/woff',
		ttf: 'font/ttf',
		otf: 'font/otf',
	};
	return map[ext] ?? 'application/octet-stream';
}

/** Direct children of src/assets/<folder>/, in display order (NN- prefixes sort right). */
export function galleryFilesInTree(tree: TreeItem[], folder: string): string[] {
	const prefix = `src/assets/${folder}/`;
	return tree
		.map((t) => t.path)
		.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
		.sort();
}

/** The full list of gallery folders to reconstruct: those in content plus any a page points at. */
export function galleryFolders(content: Content): string[] {
	const folders = Object.keys(content.galleries);
	for (const page of Object.values(content.pages)) {
		if (page.gallery && !folders.includes(page.gallery.folder)) folders.push(page.gallery.folder);
	}
	return folders;
}

export interface LoadedDoc {
	doc: EditorDoc;
	/** Managed paths present in the repo — content.json + every src/assets file. */
	managedPaths: string[];
}

/** Fetch content.json + all images from `ref` and rebuild the editor document. */
export async function loadDocFromRepo(
	client: GitHubClient,
	ref: RepoRef,
	onProgress?: (p: PublishProgress) => void,
): Promise<LoadedDoc> {
	onProgress?.({ step: 'Finding your published site…' });
	const tree = await getTree(client, ref);
	const shaByPath = new Map(tree.map((t) => [t.path, t.sha]));

	const contentSha = shaByPath.get(CONTENT_JSON_PATH);
	if (!contentSha) throw new Error('That repository doesn’t look like a portfolio — its content file is missing.');

	onProgress?.({ step: 'Downloading your content…' });
	const contentBytes = await readBlobBytes(client, ref, contentSha);
	const content = JSON.parse(new TextDecoder().decode(contentBytes)) as Content;

	const folders = galleryFolders(content);
	const folderFiles: Record<string, string[]> = {};
	for (const folder of folders) folderFiles[folder] = galleryFilesInTree(tree, folder);

	// Every image path we need to download: gallery images, then page thumbnails,
	// then the profile picture.
	const imagePaths: string[] = folders.flatMap((f) => folderFiles[f]);
	const thumbPathByPage = new Map<string, string>();
	for (const [key, page] of Object.entries(content.pages)) {
		if (!page.thumbnail) continue;
		const path = `src/assets/${page.thumbnail}`;
		if (shaByPath.has(path)) {
			thumbPathByPage.set(key, path);
			imagePaths.push(path);
		}
	}
	const profileName = content.profile.image;
	const profilePath = profileName ? `src/assets/${profileName}` : '';
	const hasProfileFile = !!profilePath && shaByPath.has(profilePath);
	if (hasProfileFile) imagePaths.push(profilePath);
	// Custom font files ride along so a later publish can re-write them.
	const fontPathByName = new Map<string, string>();
	for (const font of content.theme.customFonts ?? []) {
		const path = `src/assets/${font.file}`;
		if (shaByPath.has(path)) {
			fontPathByName.set(font.name, path);
			imagePaths.push(path);
		}
	}

	// Download each blob and register it as an editor asset, reporting progress.
	const assetIdByPath = new Map<string, string>();
	const total = imagePaths.length;
	for (let i = 0; i < imagePaths.length; i++) {
		onProgress?.({ step: 'Downloading your images…', detail: `${i} of ${total}` });
		const path = imagePaths[i];
		const bytes = await readBlobBytes(client, ref, shaByPath.get(path)!);
		const filename = path.slice(path.lastIndexOf('/') + 1);
		const blob = new Blob([bytes as BlobPart], { type: mimeFromName(filename) });
		assetIdByPath.set(path, registerAsset(blob, filename));
	}
	if (total) onProgress?.({ step: 'Downloading your images…', detail: `${total} of ${total}` });

	// Rebuild galleries from the file list, overlaying captions from content.json.
	const doc = initDocFromContent(content);
	const galleries: Record<string, ImageEntry[]> = {};
	for (const folder of folders) {
		const prefix = `src/assets/${folder}/`;
		galleries[folder] = folderFiles[folder].map((path) => {
			const fullName = path.slice(prefix.length); // the on-disk name, incl. NN- prefix (the caption key)
			const meta = content.galleries[folder]?.items?.[fullName] ?? {};
			return {
				id: uid('e'),
				filename: stripOrderPrefix(fullName),
				meta: {
					title: meta.title ?? '',
					description: meta.description ?? '',
					link: meta.link ?? '',
					w: meta.w,
					h: meta.h,
					layout: meta.layout,
				},
				assetId: assetIdByPath.get(path) ?? null,
			};
		});
	}
	doc.galleries = galleries;
	doc.profileImage = hasProfileFile
		? { filename: profileName, assetId: assetIdByPath.get(profilePath) ?? null }
		: { filename: profileName || '', assetId: null };
	for (const [key, path] of thumbPathByPage) {
		doc.pageThumbs[key] = {
			filename: path.slice(path.lastIndexOf('/') + 1),
			assetId: assetIdByPath.get(path) ?? null,
		};
	}
	for (const [name, path] of fontPathByName) {
		doc.fonts[name] = {
			filename: path.slice(path.lastIndexOf('/') + 1),
			assetId: assetIdByPath.get(path) ?? null,
		};
	}

	const managedPaths = [CONTENT_JSON_PATH, ...tree.map((t) => t.path).filter((p) => p.startsWith('src/assets/'))];
	return { doc, managedPaths };
}

/** Repos on the account that were generated from our template (most-recently-pushed first). */
export async function findPortfolioRepos(client: GitHubClient): Promise<RepoRef[]> {
	const { data } = await client.request<
		Array<{
			name: string;
			owner: { login: string };
			default_branch: string;
			template_repository: { full_name: string } | null;
		}>
	>(`/user/repos?type=owner&sort=pushed&per_page=100`);
	const wanted = `${TEMPLATE_REPO.owner}/${TEMPLATE_REPO.repo}`.toLowerCase();
	return data
		.filter((r) => r.template_repository?.full_name?.toLowerCase() === wanted)
		.map((r) => ({ owner: r.owner.login, repo: r.name, branch: r.default_branch || 'main' }));
}

export interface LoadedPortfolio {
	doc: EditorDoc;
	ref: RepoRef;
	/** Managed paths currently in the repo — content.json + every src/assets file. */
	managedPaths: string[];
}

/**
 * Resolve which repo to load (saved one, else discover via the template), pull it into
 * an EditorDoc, and return enough to persist the connection so the next publish UPDATES
 * this repo instead of creating a new one.
 */
export async function loadPublishedPortfolio(
	client: GitHubClient,
	saved: RepoRef | null,
	onProgress?: (p: PublishProgress) => void,
): Promise<LoadedPortfolio> {
	onProgress?.({ step: 'Finding your published site…' });
	let ref: RepoRef | null = saved ? await getRepo(client, saved.owner, saved.repo) : null;
	if (!ref) ref = (await findPortfolioRepos(client))[0] ?? null;
	if (!ref) {
		throw new Error(
			'We couldn’t find a published portfolio on this account yet. Publish once, then you’ll be able to edit it from anywhere.',
		);
	}

	const { doc, managedPaths } = await loadDocFromRepo(client, ref, onProgress);
	return { doc, ref, managedPaths };
}
