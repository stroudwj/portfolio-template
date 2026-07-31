import type { EditorDoc } from './types';
import { getAssetBlob } from './assets';

export interface AuditFinding {
	severity: 'error' | 'warning';
	message: string;
}

export interface PerformanceAudit {
	score: number;
	label: 'Excellent' | 'Good' | 'Needs attention';
	imageCount: number;
	knownBytes: number;
	motionWeight: number;
	notes: string[];
}

function channel(value: number): number {
	const normalized = value / 255;
	return normalized <= 0.03928
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
	const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = Number.parseInt(match[1], 16);
	return (
		0.2126 * channel((value >> 16) & 255) +
		0.7152 * channel((value >> 8) & 255) +
		0.0722 * channel(value & 255)
	);
}

function contrast(a: string, b: string): number | null {
	const first = luminance(a);
	const second = luminance(b);
	if (first === null || second === null) return null;
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function performanceAudit(doc: EditorDoc): PerformanceAudit {
	const entries = Object.values(doc.galleries).flat();
	const ids = new Set(entries.flatMap((entry) => (entry.assetId ? [entry.assetId] : [])));
	for (const slot of [
		doc.profileImage,
		doc.logoImage,
		doc.cursorImage,
		doc.resumeFile,
		...Object.values(doc.pageThumbs),
		...Object.values(doc.productImages),
	]) {
		if (slot?.assetId) ids.add(slot.assetId);
	}
	let knownBytes = 0;
	for (const id of ids) knownBytes += getAssetBlob(id)?.size ?? 0;

	const creative = doc.content.site.creative;
	let motionWeight = creative?.film ? 4 : 0;
	motionWeight += Object.values(doc.content.pages).reduce(
		(total, page) =>
			total +
			Object.keys(page.sectionMotion ?? {}).length +
			(page.headingKinetic ? 1 : 0) +
			(page.blocks ?? []).filter((block) => block.type === 'text' && block.kinetic).length,
		0,
	);
	motionWeight += entries.filter((entry) => entry.meta.effects?.hover || entry.meta.effects?.reveal).length;

	let score = 100;
	const megabytes = knownBytes / (1024 * 1024);
	if (megabytes > 40) score -= 35;
	else if (megabytes > 20) score -= 22;
	else if (megabytes > 10) score -= 10;
	if (entries.length > 80) score -= 25;
	else if (entries.length > 40) score -= 12;
	if (motionWeight > 30) score -= 18;
	else if (motionWeight > 16) score -= 8;
	if (creative?.film && (creative.film.speed ?? 100) > 150) score -= 5;
	score = Math.max(0, score);

	const notes: string[] = [];
	if (megabytes > 20) notes.push('Image payload is heavy; replace the largest originals before publishing.');
	else if (megabytes > 10) notes.push('Image payload is moderate. The built-in optimizer will help, but leaner originals will open faster.');
	if (entries.length > 40) notes.push(`${entries.length} artworks may make first visits slower on mobile data.`);
	if (motionWeight > 16) notes.push('Several simultaneous motion effects may increase compositing work on older phones.');
	if (!notes.length) notes.push('Media volume and motion complexity are within the fast range.');

	return {
		score,
		label: score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : 'Needs attention',
		imageCount: entries.length,
		knownBytes,
		motionWeight,
		notes,
	};
}

export function accessibilityAudit(doc: EditorDoc): AuditFinding[] {
	const findings: AuditFinding[] = [];
	const { content } = doc;
	const fallbackAlt = new Map<string, string>();
	for (const page of Object.values(content.pages))
		for (const gallery of [
			...(page.gallery ? [page.gallery] : []),
			...(page.blocks ?? []).flatMap((block) => block.type === 'images' ? [block.gallery] : []),
		])
			fallbackAlt.set(gallery.folder, gallery.alt.trim());

	for (const [folder, entries] of Object.entries(doc.galleries)) {
		entries.forEach((entry, index) => {
			if (!entry.meta.decorative && !entry.meta.alt.trim() && !fallbackAlt.get(folder))
				findings.push({ severity: 'error', message: `Artwork ${index + 1} in “${folder}” needs a useful description or a decorative choice.` });
			const alt = entry.meta.alt.trim().toLowerCase();
			if (alt && (alt === entry.filename.toLowerCase() || /\.(jpe?g|png|webp|gif|avif)$/i.test(alt)))
				findings.push({ severity: 'warning', message: `The description for “${entry.filename}” reads like a file name.` });
		});
	}

	if (content.theme.automaticTextContrast === false) {
		const ratio = contrast(content.theme.textColor, content.theme.backgroundColor);
		if (ratio !== null && ratio < 4.5)
			findings.push({ severity: 'error', message: `Site text contrast is ${ratio.toFixed(1)}:1; body text needs at least 4.5:1.` });
		for (const [key, page] of Object.entries(content.pages)) {
			if (!page.background) continue;
			const pageRatio = contrast(content.theme.textColor, page.background);
			if (pageRatio !== null && pageRatio < 4.5)
				findings.push({ severity: 'warning', message: `The “${page.label || key}” background may make text difficult to read (${pageRatio.toFixed(1)}:1).` });
		}
	}

	for (const [key, page] of Object.entries(content.pages)) {
		const label = page.label || key;
		if (!page.heading?.trim() && !(page.blocks ?? []).some((block) => block.type === 'text' && block.style === 'heading'))
			findings.push({ severity: 'warning', message: `“${label}” has no visible page heading.` });
		for (const block of page.blocks ?? []) {
			if (block.type === 'button') {
				const words = block.label.trim().toLowerCase();
				if (!words)
					findings.push({ severity: 'error', message: `A button on “${label}” has no accessible name.` });
				else if (['click here', 'here', 'learn more', 'more'].includes(words))
					findings.push({ severity: 'warning', message: `The button “${block.label}” on “${label}” is vague out of context.` });
			}
			if (block.type === 'form') {
				const labels = block.fields.map((field) => field.label.trim().toLowerCase());
				if (labels.some((fieldLabel) => !fieldLabel))
					findings.push({ severity: 'error', message: `A form question on “${label}” has no label.` });
				if (new Set(labels).size !== labels.length)
					findings.push({ severity: 'warning', message: `The form on “${label}” repeats a question label.` });
			}
		}
	}

	content.social.forEach((link, index) => {
		if (link.url && !link.label.trim())
			findings.push({ severity: 'error', message: `Social link ${index + 1} needs a spoken label.` });
	});
	return findings;
}
