// The template studio lets the repo owner open a starter or theme preset in the
// real editor and save it back to its JSON source file through the dev server
// (scripts/template-studio/dev-api.mjs). This module is the shared, testable
// half: resolving what to load, and turning a live EditorDoc back into template
// content — the exact inverse of initDocFromContent().
//
// Templates carry a rights contract: every image must be a catalog sample, and
// nothing may depend on bytes that live only in a browser session (uploads) —
// those become "blockers" that stop a save with a readable reason.
import type { Content, ImageMeta, Theme } from '../../lib/content';
import { ContentValidationError, parseAndMigrateContent } from '../../lib/content-schema';
import type { EditorDoc } from './types';
import { blankContent, cloneContent } from './content-init';
import { metaObject } from './exporter';
import { getSampleArtwork } from './sample-artwork';
import {
	AVAILABLE_STARTERS,
	THEME_PRESETS,
	contentWithThemePreset,
	getStarterRecipe,
	type StarterRecipe,
} from './templates';

/** Absolute middleware mount — deliberately outside the site base path. */
export const TEMPLATE_STUDIO_API = '/__template-studio';

export interface TemplateStudioIntent {
	kind: 'starter' | 'preset';
	id: string;
}

/** Parse the studio query value ("starter:painter" / "preset:gallery-linen"). */
export function parseStudioIntent(raw: string | null): TemplateStudioIntent | null {
	if (!raw) return null;
	const separator = raw.indexOf(':');
	if (separator < 1) return null;
	const kind = raw.slice(0, separator);
	const id = raw.slice(separator + 1);
	if ((kind !== 'starter' && kind !== 'preset') || !id) return null;
	return { kind, id };
}

/** What the editor should open for a studio intent. Preset editing borrows the
 * first compatible ready starter as host content so the tokens have something
 * real to dress; only the theme is saved back in that mode. */
export function resolveStudioContent(
	intent: TemplateStudioIntent,
): { name: string; content: Content } | null {
	if (intent.kind === 'starter') {
		const recipe = getStarterRecipe(intent.id as StarterRecipe['id']);
		if (!recipe?.content) return null;
		return { name: recipe.name, content: cloneContent(recipe.content) };
	}
	const preset = THEME_PRESETS.find((candidate) => candidate.id === intent.id);
	if (!preset) return null;
	const host =
		AVAILABLE_STARTERS.find((starter) => starter.compatibleThemeIds.includes(preset.id))
			?.content ?? blankContent;
	return { name: preset.name, content: contentWithThemePreset(cloneContent(host), preset.tokens) };
}

/** The preset payload: theme tokens minus per-site custom font attachments. */
export function presetTokensFromTheme(theme: Theme): Theme {
	const { customFonts: _customFonts, ...tokens } = theme;
	return tokens as Theme;
}

export interface TemplateSerialization {
	/** Normalized content ready to save, or null when validation failed. */
	content: Content | null;
	/** Human-readable reasons the current document cannot become a template. */
	blockers: string[];
}

/** Live EditorDoc → template content. Inverse of initDocFromContent(): gallery
 * entries fold back into `galleries[folder].items` (filename → meta, with the
 * stable id and sampleAssetId inside the meta object, where entriesFromContent
 * reads them), sample-backed single images map back to catalog urls, and the
 * private section library is dropped. Editing material like `sections` (and its
 * editorColor) stays — a template legitimately ships its editor organization. */
export function docToTemplateContent(doc: EditorDoc): TemplateSerialization {
	const blockers: string[] = [];
	const content = cloneContent(doc.content);

	const galleries: Content['galleries'] = {};
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		const items: Record<string, ImageMeta> = {};
		for (const entry of entries) {
			if (entry.assetId) {
				blockers.push(`“${entry.filename}” in ${folder} is an upload; templates can only contain catalog samples.`);
				continue;
			}
			const meta = { ...(metaObject({ ...entry.meta, id: entry.id }) ?? {}), id: entry.id } as ImageMeta;
			if (entry.sampleAssetId) meta.sampleAssetId = entry.sampleAssetId;
			else delete meta.sampleAssetId;
			items[entry.filename] = meta;
		}
		galleries[folder] = { ...(content.galleries[folder] ?? {}), items };
	}
	content.galleries = galleries;

	if (doc.profileImage.assetId) {
		blockers.push('The profile photo is an upload; use a catalog sample or clear it.');
	} else if (doc.profileImage.sampleAssetId) {
		const artwork = getSampleArtwork(doc.profileImage.sampleAssetId);
		if (artwork) content.profile.image = artwork.url;
	} else if (!doc.profileImage.filename) {
		content.profile.image = '';
	}

	const uploadSlots: Array<[label: string, assetId: string | null | undefined]> = [
		['header logo', doc.logoImage?.assetId],
		['footer image', doc.footerImage?.assetId],
		['signature image', doc.signatureImage?.assetId],
		['custom cursor', doc.cursorImage?.assetId],
		['résumé file', doc.resumeFile?.assetId],
	];
	for (const [label, assetId] of uploadSlots)
		if (assetId) blockers.push(`The ${label} is an upload templates cannot ship.`);
	for (const [name, slot] of Object.entries(doc.fonts))
		if (slot.assetId) blockers.push(`Font “${name}” is an uploaded file templates cannot ship.`);

	for (const [key, slot] of Object.entries(doc.pageThumbs)) {
		if (slot.assetId) {
			blockers.push(`Page “${key}” uses an uploaded thumbnail templates cannot ship.`);
			continue;
		}
		const page = content.pages[key];
		if (!page) continue;
		if (slot.sampleAssetId) {
			const artwork = getSampleArtwork(slot.sampleAssetId);
			if (artwork) page.thumbnail = artwork.url;
		}
	}

	for (const [productId, slot] of Object.entries(doc.productImages)) {
		if (!slot?.assetId) continue;
		const product = content.store?.products.find((candidate) => candidate.id === productId);
		blockers.push(`Product “${product?.name ?? productId}” image is an upload templates cannot ship.`);
	}

	for (const [key, page] of Object.entries(content.pages))
		for (const block of page.blocks ?? [])
			if (block.type === 'shots' && block.assetId)
				blockers.push(`Page “${key}” has a scroll clip upload templates cannot ship.`);

	if (doc.ogImage) {
		const entry = doc.galleries[doc.ogImage.folder]?.find((candidate) => candidate.id === doc.ogImage?.entryId);
		if (entry?.assetId) blockers.push('The social sharing image is an upload templates cannot ship.');
		else if (entry) content.site.ogImage = `${doc.ogImage.folder}/${entry.filename}`;
		else delete content.site.ogImage;
	} else {
		delete content.site.ogImage;
	}

	delete content.sectionLibrary;

	try {
		return { content: parseAndMigrateContent(content), blockers };
	} catch (error) {
		if (error instanceof ContentValidationError) {
			for (const issue of error.issues) blockers.push(`${issue.path}: ${issue.message}`);
			return { content: null, blockers };
		}
		throw error;
	}
}
