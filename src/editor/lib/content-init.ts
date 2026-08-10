// Seeds the editor document (blank or from the bundled content.json) and turns a
// live document into the PortfolioData the shared components render for preview.
import { DEFAULT_FOOTER, content as bundledContent, migrateContent, pageGalleryConfigs } from '../../lib/content';
import type { Content } from '../../lib/content';
import type { PortfolioData, ResolvedImage } from '../../portfolio/types';
import type { EditorDoc, ImageEntry } from './types';
import { getAssetUrl, getAssetPreviewUrl, uid } from './assets';
import { parseAndMigrateEditorDoc } from './doc-schema';
import { sampleArtworkIdForUrl, sampleArtworkUrl } from './sample-artwork';
import { starterFontUrl } from './starter-fonts';

/** Gray placeholder shown for images referenced by name but not uploaded this session. */
export const PLACEHOLDER_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23e4e4e4'/%3E%3Ctext x='50%25' y='50%25' fill='%23999' font-family='sans-serif' font-size='18' text-anchor='middle' dominant-baseline='middle'%3EUpload image%3C/text%3E%3C/svg%3E";

export function cloneContent(c: Content): Content {
	return JSON.parse(JSON.stringify(c)) as Content;
}

/** A valid, empty portfolio that keeps the site's page/nav structure intact. */
export const blankContent: Content = {
	schemaVersion: 5,
	site: { name: '', headerMode: 'name', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
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
		{ path: 'about', label: 'About' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Selected Works',
			heading: 'Selected Works',
			blocks: [{
				id: 'selected-works-images',
				type: 'images',
				name: 'Selected Works',
				gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc', layout: 'freeform' },
			}],
			sections: [{ id: 'main', name: 'Main section', blockIds: ['selected-works-images'] }],
		},
		art: {
			title: 'Art — {name}',
			heading: 'Art',
			blocks: [{
				id: 'art-images',
				type: 'images',
				name: 'Art',
				gallery: { folder: 'art', alt: 'Art piece', order: 'asc', layout: 'freeform' },
			}],
			sections: [{ id: 'main', name: 'Main section', blockIds: ['art-images'] }],
		},
		photography: {
			title: 'Photography — {name}',
			heading: 'Photography',
			blocks: [{
				id: 'photography-images',
				type: 'images',
				name: 'Photography',
				gallery: { folder: 'photography', alt: 'Photograph', order: 'asc', layout: 'freeform' },
			}],
			sections: [{ id: 'main', name: 'Main section', blockIds: ['photography-images'] }],
		},
		about: {
			title: 'About — {name}',
			heading: 'About',
			blocks: [{ id: 'about', type: 'about' }],
			sections: [{ id: 'main', name: 'Main section', blockIds: ['about'] }],
		},
	},
	galleries: { 'selected-works': { items: {} }, art: { items: {} }, photography: { items: {} } },
};

function entriesFromContent(content: Content): Record<string, ImageEntry[]> {
	const galleries: Record<string, ImageEntry[]> = {};
	for (const [folder, data] of Object.entries(content.galleries)) {
		galleries[folder] = Object.entries(data.items).map(([filename, sourceMeta]) => {
			const { sampleAssetId, ...meta } = sourceMeta;
			return {
				id: meta.id || uid('e'),
				filename,
				meta: {
					...meta,
					title: meta.title ?? '',
					alt: meta.alt ?? '',
					decorative: meta.decorative,
					description: meta.description ?? '',
					link: meta.link ?? '',
					clickAction: meta.clickAction,
					w: meta.w,
					h: meta.h,
					layout: meta.layout,
					focusX: meta.focusX,
					focusY: meta.focusY,
					cropAspect: meta.cropAspect,
					cropZoom: meta.cropZoom,
				brightness: meta.brightness,
				contrast: meta.contrast,
				},
				assetId: null,
				sampleAssetId: sampleAssetId ?? null,
			};
		});
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
			pageThumbs[key] = { filename, assetId: null, sampleAssetId: null };
		}
	}
	const fonts: EditorDoc['fonts'] = {};
	for (const font of cloned.theme.customFonts ?? []) {
		fonts[font.name] = {
			filename: font.file.slice(font.file.lastIndexOf('/') + 1),
			assetId: null,
			sampleAssetId: null,
		};
	}
	const resumeUrl = cloned.resume?.url ?? '';
	const cursorImagePath = cloned.site.creative?.cursorImage ?? '';
	const profileSampleAssetId = sampleArtworkIdForUrl(cloned.profile.image);
	const galleries = entriesFromContent(cloned);
	const productImages: EditorDoc['productImages'] = {};
	for (const product of cloned.store?.products ?? []) {
		const image = product.image ?? '';
		productImages[product.id] = {
			filename: image.slice(Math.max(image.lastIndexOf('/'), image.lastIndexOf('\\')) + 1),
			assetId: null,
			sampleAssetId: null,
		};
	}

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
		docVersion: 4,
		content: cloned,
		galleries,
		workbenchFolders: [],
		profileImage: {
			filename: cloned.profile.image.slice(cloned.profile.image.lastIndexOf('/') + 1),
			assetId: null,
			sampleAssetId: profileSampleAssetId,
		},
		logoImage: { filename: cloned.site.logoImage || '', assetId: null, sampleAssetId: null },
		footerImage: { filename: cloned.site.footerImage || '', assetId: null, sampleAssetId: null },
		signatureImage: {
			filename: cloned.site.signature?.image?.slice(cloned.site.signature.image.lastIndexOf('/') + 1) || '',
			assetId: null,
			sampleAssetId: null,
		},
		cursorImage: {
			filename: cursorImagePath.slice(cursorImagePath.lastIndexOf('/') + 1),
			assetId: null,
			sampleAssetId: null,
		},
		pageThumbs,
		productImages,
		fonts,
		resumeFile: {
			filename: resumeUrl.slice(resumeUrl.lastIndexOf('/') + 1),
			assetId: null,
			sampleAssetId: null,
		},
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
	const content = cloneContent(doc.content);
	const signatureImageSrc = getAssetPreviewUrl(doc.signatureImage?.assetId);
	if (signatureImageSrc && content.site.signature)
		content.site.signature = { ...content.site.signature, image: signatureImageSrc };
	const footerImageSrc = getAssetPreviewUrl(doc.footerImage?.assetId);
	if (footerImageSrc) content.site.footerImage = footerImageSrc;
	const cursorImageSrc = getAssetPreviewUrl(doc.cursorImage?.assetId);
	if (cursorImageSrc) {
		content.site.creative = {
			...content.site.creative,
			cursor: undefined,
			cursorImage: cursorImageSrc,
		};
	}
	for (const page of Object.values(content.pages)) {
		for (const block of page.blocks ?? []) {
			if (block.type !== 'shots' || !block.assetId) continue;
			block.src = getAssetUrl(block.assetId) ?? '';
		}
	}
	const galleries: Record<string, ResolvedImage[]> = {};
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		galleries[folder] = entries.map((e) => ({
			id: e.id,
			// Editor rendering uses the downscaled working copy; the lightbox gets
			// the untouched original via `full` (same split the published site makes).
			src: getAssetPreviewUrl(e.assetId) ?? sampleArtworkUrl(e.sampleAssetId) ?? PLACEHOLDER_IMAGE,
			full: getAssetUrl(e.assetId) ?? sampleArtworkUrl(e.sampleAssetId),
			sample: e.sampleAssetId ? true : undefined,
			alt: e.meta.decorative ? '' : e.meta.alt || e.meta.title || '',
			decorative: e.meta.decorative,
			title: e.meta.title || undefined,
			description: e.meta.description || undefined,
			link: e.meta.link || undefined,
			clickAction: e.meta.clickAction,
			w: e.meta.w,
			h: e.meta.h,
			layout: e.meta.layout,
			focusX: e.meta.focusX,
			focusY: e.meta.focusY,
			cropAspect: e.meta.cropAspect,
			cropZoom: e.meta.cropZoom,
			brightness: e.meta.brightness,
			contrast: e.meta.contrast,
			effects: e.meta.effects,
		}));
	}
	const uploaded = getAssetPreviewUrl(doc.profileImage.assetId);
	const profileImageSrc =
		uploaded ??
		sampleArtworkUrl(doc.profileImage.sampleAssetId) ??
		(doc.profileImage.filename ? PLACEHOLDER_IMAGE : undefined);

	// Header logo: only a real uploaded image replaces the text logo (a gray
	// placeholder up there would look broken, so fall back to text instead).
	const logoImageSrc =
		getAssetPreviewUrl(doc.logoImage?.assetId) ?? sampleArtworkUrl(doc.logoImage?.sampleAssetId) ?? undefined;

	// Sub-page card images: explicit thumbnail first, else the page's first gallery image.
	const pageThumbs: Record<string, string> = {};
	for (const [key, page] of Object.entries(doc.content.pages)) {
		const thumb = doc.pageThumbs[key];
		let src =
			getAssetPreviewUrl(thumb?.assetId ?? null) ??
			sampleArtworkUrl(thumb?.sampleAssetId) ??
			(thumb?.filename ? PLACEHOLDER_IMAGE : undefined);
		const firstGallery = pageGalleryConfigs(page)[0];
		if (!src && firstGallery) {
			const first = doc.galleries[firstGallery.folder]?.[0];
			if (first)
				src =
					getAssetPreviewUrl(first.assetId) ??
					sampleArtworkUrl(first.sampleAssetId) ??
					PLACEHOLDER_IMAGE;
		}
		if (src) pageThumbs[key] = src;
	}

	const productImageSrcs: Record<string, string> = {};
	for (const product of doc.content.store?.products ?? []) {
		const image = doc.productImages[product.id];
		const src =
			getAssetPreviewUrl(image?.assetId ?? null) ??
			sampleArtworkUrl(image?.sampleAssetId) ??
			(image?.filename || product.image ? PLACEHOLDER_IMAGE : undefined);
		if (src) productImageSrcs[product.id] = src;
	}

	// Uploaded fonts render in the preview from their blob URLs; bundled starter
	// faces load from the editor deployment's own catalog; fonts referenced but
	// not loadable this session simply fall back to the next family in the stack.
	const fontFaces = (doc.content.theme.customFonts ?? []).flatMap((font) => {
		const url = getAssetUrl(doc.fonts[font.name]?.assetId) ?? starterFontUrl(font);
		return url ? [{ name: font.name, url, weight: font.weight }] : [];
	});

	// A résumé uploaded this session opens from its blob URL in the preview.
	const resumeHref = getAssetUrl(doc.resumeFile?.assetId);

	return {
		content,
		galleries,
		profileImageSrc,
		logoImageSrc,
		pageThumbs,
		productImageSrcs,
		fontFaces,
		resumeHref,
	};
}
