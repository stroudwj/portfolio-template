// Turns the editor document into a deliverable. Deliberately split in two:
//   1. buildBundle(doc)  — pure: state -> { contentJson, files } (the schema Phase 1 expects)
//   2. PublishTarget     — delivery: ZipTarget now; a GitHubTarget can slot in later
// so switching from "download" to "publish" needs no change to the editor.
import { zipSync, strToU8 } from 'fflate';
import { pageGalleryConfigs, parseAndMigrateContent } from '../../lib/content';
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
	/** Previous branch head, retained in Git history as the rollback point. */
	previousCommitSha?: string;
	runtimeVersion?: string;
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
	const out: Partial<ImageMeta> = { ...meta };
	if (!meta.id) delete out.id;
	if (!meta.title) delete out.title;
	if (!meta.alt) delete out.alt;
	if (!meta.description) delete out.description;
	if (!meta.link) delete out.link;
	// Canvas placement supersedes the legacy grid spans, so write one or the other.
	if (meta.layout) {
		out.layout = meta.layout;
		delete out.w;
		delete out.h;
	}
	else {
		delete out.layout;
		if (!meta.w || meta.w <= 1) delete out.w;
		if (!meta.h || meta.h <= 1) delete out.h;
	}
	return Object.keys(out).length ? out : null;
}

/** Ordered, sortable file name: "03-my-photo.jpg" so folder sort == display order. */
function orderedName(index: number, total: number, entry: ImageEntry): string {
	const width = Math.max(2, String(total).length);
	return `${String(index + 1).padStart(width, '0')}-${sanitizeFilename(entry.filename || 'image')}`;
}

function preservedName(entry: ImageEntry): string {
	const name = entry.filename.trim();
	if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\'))
		throw new Error(`“${entry.filename || 'An artwork file'}” has an unsafe file name. Replace it before publishing.`);
	return name;
}

function localAssetBlob(assetId: string | null | undefined, label: string): Blob | undefined {
	if (!assetId) return undefined;
	const blob = getAssetBlob(assetId);
	if (!blob)
		throw new Error(`“${label}” is missing from this browser. Re-upload it before publishing or downloading a backup.`);
	return blob;
}

function pageKeyToken(key: string): string {
	return [...new TextEncoder().encode(key)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertBundleFiles(files: BundleFile[], references: ReadonlySet<string>): void {
	const emittedPaths = new Set<string>();
	const allPaths = new Set<string>();
	const checkPath = (path: string) => {
		const segments = path.split('/');
		const safeRoot = path.startsWith('src/assets/') || path.startsWith('public/');
		if (!safeRoot || path.includes('\\') || segments.some((segment) => !segment || segment === '.' || segment === '..'))
			throw new Error('A published file path was unsafe. Nothing was published.');
		allPaths.add(path);
	};
	for (const file of files) {
		checkPath(file.path);
		if (emittedPaths.has(file.path))
			throw new Error(`Two uploaded files would use the same published path: “${file.path}”. Rename one and try again.`);
		emittedPaths.add(file.path);
	}
	for (const path of references) checkPath(path);

	// Git cannot contain both a file and a folder at the same path. Catch cases
	// such as a profile image named “art” alongside src/assets/art/*.jpg.
	const ordered = [...allPaths].sort();
	for (let index = 0; index < ordered.length; index++) {
		for (let other = index + 1; other < ordered.length && ordered[other].startsWith(ordered[index]); other++) {
			if (ordered[other].startsWith(`${ordered[index]}/`))
				throw new Error(
					`A published file named “${ordered[index]}” conflicts with a folder using the same name. Rename the file and try again.`,
				);
		}
	}
}

/** Pure: build the Content JSON + the image files it references. */
export async function buildBundle(doc: EditorDoc): Promise<PortfolioBundle> {
	const content = cloneContent(doc.content);
	const files: BundleFile[] = [];
	const referencedFiles = new Set<string>();

	// Draft pages stay safely in the browser document but never enter a published
	// bundle. Removing them here keeps the live runtime simple and means artists do
	// not have to understand build-time routing or visibility rules.
	const draftKeys = new Set(
		Object.entries(content.pages)
			.filter(([key, page]) => key !== 'home' && page.draft)
			.map(([key]) => key),
	);
	const draftQueue = [...draftKeys];
	while (draftQueue.length) {
		const key = draftQueue.shift()!;
		for (const child of content.pages[key]?.children ?? []) {
			if (draftKeys.has(child)) continue;
			draftKeys.add(child);
			draftQueue.push(child);
		}
	}
	if (draftKeys.size) {
		for (const key of draftKeys) delete content.pages[key];
		content.nav = content.nav.filter((item) => !draftKeys.has(item.path));
		for (const page of Object.values(content.pages)) {
			if (page.children) page.children = page.children.filter((key) => !draftKeys.has(key));
		}
	}

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
	const publishedFolders = new Set(configsByFolder.keys());

	// The social-card image is re-resolved every publish: gallery files get renamed
	// (ordered prefixes), so a stale path would 404. No valid choice = automatic.
	let ogPath: string | undefined;

	for (const [folder, entries] of Object.entries(doc.galleries)) {
		if (!publishedFolders.has(folder)) {
			delete content.galleries[folder];
			continue;
		}
		const items: Record<string, Partial<ImageMeta>> = {};
		// A null id deliberately means “this file already lives in the template or
		// repository.” It cannot be renamed without its bytes. Preserve every name
		// and the gallery's existing asc/desc rule whenever such a reference exists.
		const hasReferenceOnlyFiles = entries.some((entry) => !entry.assetId);
		const hasUploadedFiles = entries.some((entry) => !!entry.assetId);
		if (hasReferenceOnlyFiles && hasUploadedFiles)
			throw new Error(
				`The “${folder}” image group mixes template images with new uploads. Replace the template images first so the published order stays exact.`,
			);
		if (hasReferenceOnlyFiles) {
			const names = entries.map(preservedName);
			for (const config of configsByFolder.get(folder) ?? []) {
				// Astro's eager glob is sorted with JavaScript's default code-unit order.
				const runtimeOrder = [...names].sort();
				if (config.order === 'desc') runtimeOrder.reverse();
				if (runtimeOrder.some((name, index) => name !== names[index]))
					throw new Error(
						`The referenced images in “${folder}” cannot be reordered until they are replaced with uploaded files.`,
					);
			}
		}
		const usedNames = new Set<string>();
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const blob = localAssetBlob(entry.assetId, entry.filename || 'Artwork');
			const baseName = hasReferenceOnlyFiles ? preservedName(entry) : orderedName(i, entries.length, entry);
			let finalName = baseName;
			for (let suffix = 2; usedNames.has(finalName); suffix++) {
				if (!blob) throw new Error(`The referenced artwork file “${baseName}” appears more than once.`);
				const dot = baseName.lastIndexOf('.');
				finalName = dot > 0 ? `${baseName.slice(0, dot)}-${suffix}${baseName.slice(dot)}` : `${baseName}-${suffix}`;
			}
			usedNames.add(finalName);
			const meta = metaObject({ ...entry.meta, id: entry.id });
			if (meta) items[finalName] = meta;
			if (blob) files.push({ path: `src/assets/${folder}/${finalName}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
			else referencedFiles.add(`src/assets/${folder}/${finalName}`);
			if (doc.ogImage && doc.ogImage.folder === folder && doc.ogImage.entryId === entry.id)
				ogPath = `${folder}/${finalName}`;
		}
		content.galleries[folder] = { ...content.galleries[folder], items } as Content['galleries'][string];
		if (!hasReferenceOnlyFiles)
			for (const config of configsByFolder.get(folder) ?? []) config.order = 'asc';
	}
	content.site.ogImage = ogPath;

	// Résumé PDF, served from public/ at the site root. Uploaded this session ->
	// write the file and point resume.url at it; loaded from the repo without
	// re-upload -> the existing public/ file stays (publish only manages
	// src/assets/), so keep the reference; removed -> clear the reference.
	if (doc.resumeFile?.filename) {
		const resumeBlob = localAssetBlob(doc.resumeFile.assetId, doc.resumeFile.filename || 'Résumé');
		if (resumeBlob) {
			const finalName = sanitizeFilename(doc.resumeFile.filename);
			files.push({ path: `public/${finalName}`, bytes: new Uint8Array(await resumeBlob.arrayBuffer()) });
			content.resume = { label: content.resume?.label || 'Résumé', url: finalName };
		}
		else if (content.resume?.url) referencedFiles.add(`public/${content.resume.url}`);
	} else if (content.resume) {
		content.resume = { ...content.resume, url: '' };
	}

	// Profile image.
	const profileBlob = localAssetBlob(doc.profileImage.assetId, doc.profileImage.filename || 'Profile image');
	if (profileBlob) {
		const finalName = sanitizeFilename(doc.profileImage.filename || 'profile');
		files.push({ path: `src/assets/${finalName}`, bytes: new Uint8Array(await profileBlob.arrayBuffer()) });
		content.profile.image = finalName;
	} else {
		content.profile.image = doc.profileImage.filename;
		if (content.profile.image) referencedFiles.add(`src/assets/${content.profile.image}`);
	}

	// Header logo image, at the assets root with a stable "logo-" prefix so it can't
	// collide with the profile image (the prefix is applied exactly once per name).
	const logoBlob = localAssetBlob(doc.logoImage?.assetId, doc.logoImage?.filename || 'Logo');
	if (logoBlob) {
		const cleaned = sanitizeFilename(doc.logoImage.filename || 'logo');
		const finalName = cleaned.startsWith('logo-') ? cleaned : `logo-${cleaned}`;
		files.push({ path: `src/assets/${finalName}`, bytes: new Uint8Array(await logoBlob.arrayBuffer()) });
		content.site.logoImage = finalName;
	} else {
		content.site.logoImage = doc.logoImage?.filename || undefined;
		if (content.site.logoImage) referencedFiles.add(`src/assets/${content.site.logoImage}`);
	}

	// Page thumbnails (sub-page cards). Written under src/assets/thumbs/, name-prefixed
	// with the page key so two pages' thumbnails can't collide. A thumb with no blob was
	// loaded from the repo — its content.pages[].thumbnail path is already correct.
	for (const [key, thumb] of Object.entries(doc.pageThumbs)) {
		const page = content.pages[key];
		const blob = localAssetBlob(thumb.assetId, thumb.filename || `${key} thumbnail`);
		if (!page) continue;
		if (!blob) {
			if (page.thumbnail) referencedFiles.add(`src/assets/${page.thumbnail}`);
			continue;
		}
		const finalName = `thumbs/${pageKeyToken(key)}-${sanitizeFilename(thumb.filename || 'thumb')}`;
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
			const blob = localAssetBlob(slot?.assetId, slot?.filename || font.name);
			if (blob) {
				const file = `fonts/${sanitizeFilename(slot.filename || font.name)}`;
				files.push({ path: `src/assets/${file}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
				kept.push({ name: font.name, file });
			} else if (font.file) {
				kept.push(font);
				referencedFiles.add(`src/assets/${font.file}`);
			}
		}
		content.theme.customFonts = kept.length ? kept : undefined;
	}

	const contentJson = parseAndMigrateContent(content);
	assertBundleFiles(files, referencedFiles);
	return { contentJson, files };
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
