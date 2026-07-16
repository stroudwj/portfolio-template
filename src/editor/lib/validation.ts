// Small, dependency-free validators used for live inline feedback and the
// pre-export summary.
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

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const isImageFile = (file: File): boolean => /^image\//.test(file.type);

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
	return issues;
}
