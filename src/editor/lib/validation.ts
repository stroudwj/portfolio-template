// Small, dependency-free validators used for live inline feedback and the
// pre-export summary.
import { embedSpec } from '../../portfolio/mediaEmbed';
import { stripePaymentLink } from '../../portfolio/paymentEmbed';
import { pageGalleryConfigs } from '../../lib/content';
import type { EditorDoc } from './types';
import { safeWebHref } from '../../portfolio/safeHref';

export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isUrl = (value: string): boolean => {
	// safeWebHref also accepts a familiar scheme-less domain such as example.com/work
	// and normalizes it to https:// when rendered.
	return safeWebHref(value) !== undefined;
};

// Ingest cap only — images are downscaled/re-encoded on upload (lib/compressImage.ts),
// so camera-sized files are welcome here. What actually ships must stay well under
// GitHub's create-blob request limit (~25 MB body; base64 adds a third), which the
// publish path enforces per file.
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export const isImageFile = (file: File): boolean => /^image\//.test(file.type);

export const FONT_EXTENSIONS = ['woff2', 'woff', 'ttf', 'otf'];
export const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MB

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PDF_MB = MAX_PDF_BYTES / (1024 * 1024);

// Matches both publishing targets' per-file ceiling; videos cannot be recompressed
// safely in-browser the way oversized still images can.
export const MAX_VIDEO_BYTES = 18 * 1024 * 1024;
export const MAX_VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024);

/** Résumé uploads: a PDF by MIME type or, failing that, by extension. */
export const isPdfFile = (file: File): boolean =>
	file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Scroll clips use browser-native formats so the published site needs no player SDK. */
export const isVideoFile = (file: File): boolean =>
	/^video\/(?:mp4|webm)$/i.test(file.type) || /\.(?:mp4|webm)$/i.test(file.name);

/** Font files often have an empty MIME type, so check the extension. */
export const isFontFile = (file: File): boolean =>
	FONT_EXTENSIONS.includes(file.name.toLowerCase().split('.').pop() ?? '');

/** Make a user file name safe for a URL/path, preserving the extension. */
export function sanitizeFilename(name: string): string {
	const cleaned = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || 'file';
}

/**
 * Whether anything actually hangs on the wall yet. Publishing needs two independent
 * things — a built site AND an unlocked (paid) account — in either order; this is the
 * "built" half. A fresh blank/template document has structure but nothing publishable,
 * so Publish stays unavailable (with no payment prompt) until something is here.
 */
export function hasPublishableContent(doc: EditorDoc): boolean {
	for (const entries of Object.values(doc.galleries)) {
		// Only images that really exist in this browser count — entries referenced by
		// name but never uploaded render as gray placeholders, not publishable work.
		if (entries.some((e) => e.assetId)) return true;
	}
	for (const product of doc.content.store?.products ?? []) {
		if (product.status !== 'draft' && doc.productImages[product.id]?.assetId) return true;
	}
	for (const page of Object.values(doc.content.pages)) {
		for (const block of page.blocks ?? []) {
			if (block.type === 'text' && block.text.trim()) return true;
			if (block.type === 'embed' && block.url.trim()) return true;
			if (block.type === 'shots' && (!!block.assetId || block.src.trim())) return true;
		}
	}
	return Boolean(doc.content.profile.bio.trim());
}

/** Human-readable problems to surface before export (empty = all good). */
export function collectIssues(doc: EditorDoc): string[] {
	const issues: string[] = [];
	if (!doc.content.site.name.trim()) issues.push('Your name is empty.');
	if (doc.content.contact.email && !isEmail(doc.content.contact.email))
		issues.push('The contact email doesn’t look valid.');
	doc.content.social.forEach((s, i) => {
		if (s.url && !isUrl(s.url)) issues.push(`Social link ${i + 1} (“${s.label || 'untitled'}”) has an invalid URL.`);
	});
	const publishedPages = Object.entries(doc.content.pages).filter(([, page]) => !page.draft);
	const publishedFolders = new Set(
		publishedPages.flatMap(([, page]) => pageGalleryConfigs(page).map((gallery) => gallery.folder)),
	);
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		if (!publishedFolders.has(folder)) continue;
		entries.forEach((e) => {
			const imageLabel = e.meta.title || e.filename;
			if (
				e.meta.link &&
				!isUrl(e.meta.link) &&
				!e.meta.link.startsWith('/') &&
				!e.meta.link.startsWith('#')
			)
				issues.push(`The image link for “${imageLabel}” is not a valid destination.`);
			if (e.meta.clickAction === 'link' && !e.meta.link.trim())
				issues.push(`The linked image “${imageLabel}” needs a destination.`);
		});
	}
	for (const [key, page] of publishedPages) {
		if (!page.title.trim()) issues.push(`The page “${page.label ?? key}” needs a browser and search title.`);
		for (const block of page.blocks ?? []) {
			if (block.type === 'embed') {
				if (!block.url.trim()) issues.push(`An embed on “${page.label ?? key}” has no link yet.`);
				else if (!embedSpec(block.url) && !stripePaymentLink(block.url))
					issues.push(
						`An embed on “${page.label ?? key}” needs a supported YouTube, Vimeo, SoundCloud, Bandcamp, Google Maps, or Stripe link.`,
					);
			}
			if (block.type === 'shots') {
				if (!block.assetId && !block.src.trim())
					issues.push(`A Shots / scroll video block on “${page.label ?? key}” has no clip yet.`);
				else if (
					!block.assetId &&
					!isUrl(block.src) &&
					(block.src.startsWith('//') ||
						/^[a-z][a-z\d+.-]*:/i.test(block.src) ||
						block.src.includes('\\') ||
						block.src.split('/').some((part) => part === '..'))
				)
					issues.push(`A Shots / scroll video block on “${page.label ?? key}” has an invalid video source.`);
			}
			if (
				block.type === 'button' &&
				(!block.url.trim() || (!isUrl(block.url) && !block.url.startsWith('/') && !block.url.startsWith('#')))
			)
				issues.push(`A button on “${page.label ?? key}” needs a valid destination.`);
			if (block.type === 'text' && block.link && !isUrl(block.link) && !block.link.startsWith('/') && !block.link.startsWith('#'))
				issues.push(`Linked text on “${page.label ?? key}” needs a valid destination.`);
			if (block.type === 'form') {
				if (block.action && (!isUrl(block.action) || !block.action.startsWith('https://')))
					issues.push(`The direct-delivery address for the contact form on “${page.label ?? key}” is not valid.`);
				else if (!block.action && !isEmail(doc.content.contact.email))
					issues.push(`Add a contact email so the form on “${page.label ?? key}” has somewhere to send messages.`);
			}
		}
	}
	return issues;
}
