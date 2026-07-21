// Seeds the editor document (blank or from the bundled content.json) and turns a
// live document into the PortfolioData the shared components render for preview.
import { DEFAULT_FOOTER, content as bundledContent, migrateContent, pageGalleryConfigs } from '../../lib/content';
import type { Content } from '../../lib/content';
import type { PortfolioData, ResolvedImage } from '../../portfolio/types';
import type { EditorDoc, ImageEntry } from './types';
import { getAssetUrl, getAssetPreviewUrl, uid } from './assets';
import { parseAndMigrateEditorDoc } from './doc-schema';

/** Gray placeholder shown for images referenced by name but not uploaded this session. */
export const PLACEHOLDER_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23e4e4e4'/%3E%3Ctext x='50%25' y='50%25' fill='%23999' font-family='sans-serif' font-size='18' text-anchor='middle' dominant-baseline='middle'%3EUpload image%3C/text%3E%3C/svg%3E";

export function cloneContent(c: Content): Content {
	return JSON.parse(JSON.stringify(c)) as Content;
}

/** A valid, empty portfolio that keeps the site's page/nav structure intact. */
export const blankContent: Content = {
	schemaVersion: 2,
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
	theme: {
		backgroundColor: '#fafafa',
		textColor: '#111111',
		mutedTextColor: '#666666',
		accentColor: '#000000',
		fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
	},
	nav: [
		{ path: '', label: 'Home' },
		{ path: 'art', label: 'Art' },
		{ path: 'photography', label: 'Photography' },
		{ path: 'bio', label: 'About' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Selected Works',
			heading: 'Selected Works',
			gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		art: {
			title: 'Art — {name}',
			gallery: { folder: 'art', alt: 'Art piece', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		photography: {
			title: 'Photography — {name}',
			gallery: { folder: 'photography', alt: 'Photograph', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		bio: { title: 'About — {name}', blocks: [{ id: 'about', type: 'about' }] },
	},
	galleries: { 'selected-works': { items: {} }, art: { items: {} }, photography: { items: {} } },
};

function entriesFromContent(content: Content): Record<string, ImageEntry[]> {
	const galleries: Record<string, ImageEntry[]> = {};
	for (const [folder, data] of Object.entries(content.galleries)) {
		galleries[folder] = Object.entries(data.items).map(([filename, meta]) => ({
			id: meta.id || uid('e'),
			filename,
			meta: {
				...meta,
				title: meta.title ?? '',
				alt: meta.alt ?? '',
				description: meta.description ?? '',
				link: meta.link ?? '',
				w: meta.w,
				h: meta.h,
				layout: meta.layout,
			},
			assetId: null,
		}));
	}
	// Ensure every folder a page points at — main gallery or image group — has a
	// (possibly empty) list.
	for (const page of Object.values(content.pages)) {
		for (const config of pageGalleryConfigs(page)) {
			if (!galleries[config.folder]) galleries[config.folder] = [];
		}
	}
	return galleries;
}

export function initDocFromContent(content: Content): EditorDoc {
	const cloned = migrateContent(cloneContent(content));
	const pageThumbs: EditorDoc['pageThumbs'] = {};
	for (const [key, page] of Object.entries(cloned.pages)) {
		if (page.thumbnail) {
			const filename = page.thumbnail.slice(page.thumbnail.lastIndexOf('/') + 1);
			pageThumbs[key] = { filename, assetId: null };
		}
	}
	const fonts: EditorDoc['fonts'] = {};
	for (const font of cloned.theme.customFonts ?? []) {
		fonts[font.name] = { filename: font.file.slice(font.file.lastIndexOf('/') + 1), assetId: null };
	}
	const resumeUrl = cloned.resume?.url ?? '';
	const galleries = entriesFromContent(cloned);

	// Map a stored social-card image ("folder/file.jpg") back to its entry so the
	// Sharing tab shows the current choice and the next publish keeps it.
	let ogImage: EditorDoc['ogImage'];
	if (cloned.site.ogImage) {
		const slash = cloned.site.ogImage.indexOf('/');
		const folder = cloned.site.ogImage.slice(0, slash);
		const file = cloned.site.ogImage.slice(slash + 1);
		const entry = galleries[folder]?.find((e) => e.filename === file);
		if (entry) ogImage = { folder, entryId: entry.id };
	}

	return {
		docVersion: 1,
		content: cloned,
		galleries,
		profileImage: { filename: cloned.profile.image || '', assetId: null },
		logoImage: { filename: cloned.site.logoImage || '', assetId: null },
		pageThumbs,
		fonts,
		resumeFile: { filename: resumeUrl.slice(resumeUrl.lastIndexOf('/') + 1), assetId: null },
		ogImage,
	};
}

export const blankDoc = (): EditorDoc => initDocFromContent(blankContent);
export const existingDoc = (): EditorDoc => initDocFromContent(bundledContent);

/** Validate/upgrade a document supplied by an already-typed editor boundary. */
export function upgradeDoc(doc: EditorDoc): EditorDoc {
	return parseAndMigrateEditorDoc(doc);
}

/** Live document -> resolved data the shared portfolio components can render. */
export function docToPortfolioData(doc: EditorDoc): PortfolioData {
	const galleries: Record<string, ResolvedImage[]> = {};
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		galleries[folder] = entries.map((e) => ({
			id: e.id,
			// Editor rendering uses the downscaled working copy; the lightbox gets
			// the untouched original via `full` (same split the published site makes).
			src: getAssetPreviewUrl(e.assetId) ?? PLACEHOLDER_IMAGE,
			full: getAssetUrl(e.assetId),
			alt: e.meta.alt || e.meta.title || '',
			title: e.meta.title || undefined,
			description: e.meta.description || undefined,
			link: e.meta.link || undefined,
			w: e.meta.w,
			h: e.meta.h,
			layout: e.meta.layout,
		}));
	}
	const uploaded = getAssetPreviewUrl(doc.profileImage.assetId);
	const profileImageSrc = uploaded ?? (doc.profileImage.filename ? PLACEHOLDER_IMAGE : undefined);

	// Header logo: only a real uploaded image replaces the text logo (a gray
	// placeholder up there would look broken, so fall back to text instead).
	const logoImageSrc = getAssetPreviewUrl(doc.logoImage?.assetId) ?? undefined;

	// Sub-page card images: explicit thumbnail first, else the page's first gallery image.
	const pageThumbs: Record<string, string> = {};
	for (const [key, page] of Object.entries(doc.content.pages)) {
		const thumb = doc.pageThumbs[key];
		let src = getAssetPreviewUrl(thumb?.assetId ?? null) ?? (thumb?.filename ? PLACEHOLDER_IMAGE : undefined);
		if (!src && page.gallery) {
			const first = doc.galleries[page.gallery.folder]?.[0];
			if (first) src = getAssetPreviewUrl(first.assetId) ?? PLACEHOLDER_IMAGE;
		}
		if (src) pageThumbs[key] = src;
	}

	// Uploaded fonts render in the preview from their blob URLs; fonts referenced
	// but not uploaded this session simply fall back to the next family in the stack.
	const fontFaces = (doc.content.theme.customFonts ?? []).flatMap((font) => {
		const url = getAssetUrl(doc.fonts[font.name]?.assetId);
		return url ? [{ name: font.name, url }] : [];
	});

	// A résumé uploaded this session opens from its blob URL in the preview.
	const resumeHref = getAssetUrl(doc.resumeFile?.assetId);

	return { content: doc.content, galleries, profileImageSrc, logoImageSrc, pageThumbs, fontFaces, resumeHref };
}
