// Small, dependency-free validators used for live inline feedback and the
// pre-export summary.
import { videoEmbedSrc } from '../../portfolio/videoEmbed';
import type { EditorDoc } from './types';

export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isUrl = (value: string): boolean => {
	if (!value.trim()) return false;
	try {
		// Only web links: anything else (javascript:, data:, file:, …) would ship verbatim
		// as an href on the published site — a script-injection vector, not a portfolio link.
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
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

/** Résumé uploads: a PDF by MIME type or, failing that, by extension. */
export const isPdfFile = (file: File): boolean =>
	file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

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

/** Human-readable problems to surface before export (empty = all good). */
export function collectIssues(doc: EditorDoc): string[] {
	const issues: string[] = [];
	if (!doc.content.site.name.trim()) issues.push('Your name is empty.');
	if (doc.content.contact.email && !isEmail(doc.content.contact.email))
		issues.push('The contact email doesn’t look valid.');
	doc.content.social.forEach((s, i) => {
		if (s.url && !isUrl(s.url)) issues.push(`Social link ${i + 1} (“${s.label || 'untitled'}”) has an invalid URL.`);
	});
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		entries.forEach((e) => {
			if (e.meta.link && !isUrl(e.meta.link))
				issues.push(`A ${folder} item link (“${e.meta.title || e.filename}”) is not a valid URL.`);
		});
	}
	for (const [key, page] of Object.entries(doc.content.pages)) {
		for (const block of page.blocks ?? []) {
			if (block.type !== 'embed') continue;
			if (!block.url.trim()) issues.push(`A video on “${page.label ?? key}” has no link yet.`);
			else if (!videoEmbedSrc(block.url))
				issues.push(`A video link on “${page.label ?? key}” isn’t a YouTube or Vimeo URL.`);
		}
	}
	return issues;
}
