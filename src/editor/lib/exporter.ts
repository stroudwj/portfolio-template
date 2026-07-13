// Turns the editor document into a deliverable. Deliberately split in two:
//   1. buildBundle(doc)  — pure: state -> { contentJson, files } (the schema Phase 1 expects)
//   2. PublishTarget     — delivery: ZipTarget now; a GitHubTarget can slot in later
// so switching from "download" to "publish" needs no change to the editor.
import { zipSync, strToU8 } from 'fflate';
import type { Content } from '../../lib/content';
import type { EditorDoc, ImageEntry, ImageMeta } from './types';
import { getAssetBlob } from './assets';
import { cloneContent } from './content-init';
import { sanitizeFilename } from './validation';

export interface BundleFile {
	/** Project-relative path, e.g. src/assets/art/01-piece.jpg */
	path: string;
	bytes: Uint8Array;
}

export interface PortfolioBundle {
	contentJson: Content;
	files: BundleFile[];
}

/** A step update a target can report so the UI can show live progress. */
export interface PublishProgress {
	/** Short user-facing line, e.g. "Uploading images…". */
	step: string;
	/** Optional secondary detail, e.g. "3 of 8". */
	detail?: string;
}

/** What a publish yields — used to render the success screen. Empty for local targets. */
export interface PublishResult {
	/** The live website URL, if the target hosts one. */
	url?: string;
	/** A link to where the project now lives (e.g. the GitHub repo). */
	repoUrl?: string;
}

/**
 * The one seam between the editor and "where does this go". ZipTarget delivers a
 * download today; a GitHubTarget (or Netlify/Vercel/…) implements the same method,
 * so the editor never learns which target it is using.
 */
export interface PublishTarget {
	readonly name: string;
	publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult>;
}

function metaObject(meta: ImageMeta): Partial<ImageMeta> | null {
	const out: Partial<ImageMeta> = {};
	if (meta.title) out.title = meta.title;
	if (meta.description) out.description = meta.description;
	if (meta.link) out.link = meta.link;
	return Object.keys(out).length ? out : null;
}

/** Ordered, sortable file name: "03-my-photo.jpg" so folder sort == display order. */
function orderedName(index: number, total: number, entry: ImageEntry): string {
	const width = Math.max(2, String(total).length);
	return `${String(index + 1).padStart(width, '0')}-${sanitizeFilename(entry.filename || 'image')}`;
}

/** Pure: build the Content JSON + the image files it references. */
export async function buildBundle(doc: EditorDoc): Promise<PortfolioBundle> {
	const content = cloneContent(doc.content);
	const files: BundleFile[] = [];

	// Which page owns each gallery folder (so we can force order: 'asc').
	const pageByFolder = new Map<string, string>();
	for (const [pageKey, page] of Object.entries(content.pages)) {
		if (page.gallery) pageByFolder.set(page.gallery.folder, pageKey);
	}

	for (const [folder, entries] of Object.entries(doc.galleries)) {
		const items: Record<string, Partial<ImageMeta>> = {};
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const finalName = orderedName(i, entries.length, entry);
			const meta = metaObject(entry.meta);
			if (meta) items[finalName] = meta;
			const blob = getAssetBlob(entry.assetId);
			if (blob) files.push({ path: `src/assets/${folder}/${finalName}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
		}
		content.galleries[folder] = { items } as Content['galleries'][string];
		const pageKey = pageByFolder.get(folder);
		if (pageKey && content.pages[pageKey].gallery) content.pages[pageKey].gallery!.order = 'asc';
	}

	// Profile image.
	const profileBlob = getAssetBlob(doc.profileImage.assetId);
	if (profileBlob) {
		const finalName = sanitizeFilename(doc.profileImage.filename || 'profile');
		files.push({ path: `src/assets/${finalName}`, bytes: new Uint8Array(await profileBlob.arrayBuffer()) });
		content.profile.image = finalName;
	} else {
		content.profile.image = doc.profileImage.filename;
	}

	return { contentJson: content, files };
}

/** The exact text written to src/data/content.json — shared by every target. */
export function contentJsonString(content: Content): string {
	return `${JSON.stringify(content, null, 2)}\n`;
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Delivers the bundle as a .zip that unzips straight over the Astro project. */
export class ZipTarget implements PublishTarget {
	readonly name = 'Download ZIP';

	async publish(bundle: PortfolioBundle): Promise<PublishResult> {
		const tree: Record<string, Uint8Array> = {
			'src/data/content.json': strToU8(contentJsonString(bundle.contentJson)),
		};
		for (const file of bundle.files) tree[file.path] = file.bytes;
		const zipped = zipSync(tree, { level: 6 });
		downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), 'portfolio.zip');
		return {};
	}
}

/** Convenience: download just content.json. */
export function downloadContentJson(content: Content): void {
	downloadBlob(new Blob([contentJsonString(content)], { type: 'application/json' }), 'content.json');
}
