// Turns the editor document into a deliverable. Deliberately split in two:
//   1. buildBundle(doc)  — pure: state -> { contentJson, files } (the schema Phase 1 expects)
//   2. PublishTarget     — delivery: ZipTarget now; a GitHubTarget can slot in later
// so switching from "download" to "publish" needs no change to the editor.
import { zipSync, strToU8 } from 'fflate';
import { pageGalleryConfigs } from '../../lib/content';
import type { Content, GalleryConfig } from '../../lib/content';
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
	/** Set by targets that build remotely, so the UI can poll for build completion. */
	owner?: string;
	repo?: string;
	commitSha?: string;
}

/**
 * The one seam between the editor and "where does this go". ZipTarget delivers a
 * download today; a GitHubTarget (or Netlify/Vercel/…) implements the same method,
 * so the editor never learns which target it is using.
 */
export interface PublishTarget {
	publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult>;
}

function metaObject(meta: ImageMeta): Partial<ImageMeta> | null {
	const out: Partial<ImageMeta> = {};
	if (meta.title) out.title = meta.title;
	if (meta.description) out.description = meta.description;
	if (meta.link) out.link = meta.link;
	// Canvas placement supersedes the legacy grid spans, so write one or the other.
	if (meta.layout) out.layout = meta.layout;
	else {
		if (meta.w && meta.w > 1) out.w = meta.w;
		if (meta.h && meta.h > 1) out.h = meta.h;
	}
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

	// Every config that renders a folder — a page's main gallery or an image
	// group — so each can be forced to order: 'asc' (file names carry the order).
	const configsByFolder = new Map<string, GalleryConfig[]>();
	for (const page of Object.values(content.pages)) {
		for (const config of pageGalleryConfigs(page)) {
			const list = configsByFolder.get(config.folder) ?? [];
			list.push(config);
			configsByFolder.set(config.folder, list);
		}
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
		for (const config of configsByFolder.get(folder) ?? []) config.order = 'asc';
	}

	// Résumé PDF, served from public/ at the site root. Uploaded this session ->
	// write the file and point resume.url at it; loaded from the repo without
	// re-upload -> the existing public/ file stays (publish only manages
	// src/assets/), so keep the reference; removed -> clear the reference.
	if (doc.resumeFile?.filename) {
		const resumeBlob = getAssetBlob(doc.resumeFile.assetId);
		if (resumeBlob) {
			const finalName = sanitizeFilename(doc.resumeFile.filename);
			files.push({ path: `public/${finalName}`, bytes: new Uint8Array(await resumeBlob.arrayBuffer()) });
			content.resume = { label: content.resume?.label || 'Résumé', url: finalName };
		}
	} else if (content.resume) {
		content.resume = { ...content.resume, url: '' };
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

	// Header logo image, at the assets root with a stable "logo-" prefix so it can't
	// collide with the profile image (the prefix is applied exactly once per name).
	const logoBlob = getAssetBlob(doc.logoImage?.assetId);
	if (logoBlob) {
		const cleaned = sanitizeFilename(doc.logoImage.filename || 'logo');
		const finalName = cleaned.startsWith('logo-') ? cleaned : `logo-${cleaned}`;
		files.push({ path: `src/assets/${finalName}`, bytes: new Uint8Array(await logoBlob.arrayBuffer()) });
		content.site.logoImage = finalName;
	} else {
		content.site.logoImage = doc.logoImage?.filename || undefined;
	}

	// Page thumbnails (sub-page cards). Written under src/assets/thumbs/, name-prefixed
	// with the page key so two pages' thumbnails can't collide. A thumb with no blob was
	// loaded from the repo — its content.pages[].thumbnail path is already correct.
	for (const [key, thumb] of Object.entries(doc.pageThumbs)) {
		const page = content.pages[key];
		const blob = getAssetBlob(thumb.assetId);
		if (!page || !blob) continue;
		const finalName = `thumbs/${sanitizeFilename(`${key.replace(/\//g, '-')}-${thumb.filename || 'thumb'}`)}`;
		files.push({ path: `src/assets/${finalName}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
		page.thumbnail = finalName;
	}
	// Thumbs removed in the editor: the doc no longer tracks them, so drop the reference.
	for (const [key, page] of Object.entries(content.pages)) {
		if (page.thumbnail && !doc.pageThumbs[key]) page.thumbnail = undefined;
	}

	// Custom fonts, written under src/assets/fonts/. A font with no blob was loaded
	// from the repo without re-download — keep its reference; the publish target
	// preserves the file (same rule as the profile image).
	const customFonts = content.theme.customFonts ?? [];
	if (customFonts.length) {
		const kept: typeof customFonts = [];
		for (const font of customFonts) {
			const slot = doc.fonts[font.name];
			const blob = getAssetBlob(slot?.assetId);
			if (blob) {
				const file = `fonts/${sanitizeFilename(slot.filename || font.name)}`;
				files.push({ path: `src/assets/${file}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
				kept.push({ name: font.name, file });
			} else if (font.file) kept.push(font);
		}
		content.theme.customFonts = kept.length ? kept : undefined;
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
