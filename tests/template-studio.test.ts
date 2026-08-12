// The template studio's save path rests on one contract: turning a live editor
// document back into template content is the exact inverse of loading it. These
// tests lock that round trip, the upload blockers, and the catalog drift guards
// the dev API enforces before writing any JSON.
import { describe, expect, it } from 'vitest';
import { cloneContent, initDocFromContent } from '../src/editor/lib/content-init';
import {
	docToTemplateContent,
	parseStudioIntent,
	presetTokensFromTheme,
	resolveStudioContent,
} from '../src/editor/lib/template-studio';
import {
	AVAILABLE_STARTERS,
	STARTER_RECIPES,
	THEME_PRESETS,
	validateStarterCatalog,
} from '../src/editor/lib/templates';

describe('template studio serialization', () => {
	it('round-trips every ready starter without loss', () => {
		for (const starter of AVAILABLE_STARTERS) {
			const { content, blockers } = docToTemplateContent(initDocFromContent(starter.content));
			expect(blockers).toEqual([]);
			expect(content).toEqual(starter.content);
		}
	});

	it('stays stable through an editing pass and a reload', () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const doc = initDocFromContent(clearing.content);
		const entry = doc.galleries.clearing[0];
		entry.meta.layout = { ...(entry.meta.layout ?? { ar: 1 }), x: 10, y: 8, w: 30 };
		entry.meta.title = 'Renamed work';
		const home = doc.content.pages.home;
		const sectionKey = `section:${home.sections![0].id}`;
		home.sectionColors = { ...(home.sectionColors ?? {}), [sectionKey]: '#123456' };
		doc.content.site.footer = 'A quieter footer';

		const first = docToTemplateContent(doc);
		expect(first.blockers).toEqual([]);
		expect(first.content).not.toBeNull();

		const second = docToTemplateContent(initDocFromContent(first.content!));
		expect(second.blockers).toEqual([]);
		expect(second.content).toEqual(first.content);
		expect(second.content!.pages.home.sectionColors).toMatchObject({ [sectionKey]: '#123456' });
	});

	it('blocks uploads and session-only files with readable reasons', () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const doc = initDocFromContent(clearing.content);
		doc.galleries.clearing[0].assetId = 'asset-1';
		doc.profileImage = { filename: 'me.jpg', assetId: 'asset-2', sampleAssetId: null };
		doc.fonts = { Marker: { filename: 'marker.woff2', assetId: 'asset-3', sampleAssetId: null } };

		const { blockers } = docToTemplateContent(doc);
		expect(blockers).toHaveLength(3);
		expect(blockers.every((blocker) => blocker.includes('upload'))).toBe(true);
	});

	it('rejects catalog drift the way the dev API will', () => {
		const clearing = STARTER_RECIPES.find((starter) => starter.id === 'clearing')!;
		const tampered = cloneContent(clearing.content!);
		const [, item] = Object.entries(tampered.galleries.clearing.items)[0];
		item.description = 'my own credit';
		item.link = 'https://example.com/not-the-museum';
		// A font outside the bundled catalog (spec 23) is still drift, as is a
		// catalog face missing its weight declaration.
		tampered.theme = {
			...tampered.theme,
			customFonts: [
				{ name: 'X', file: 'x.woff2' },
				{ name: 'Gilda Display', file: 'fonts/gilda-display.woff2' },
			],
		};

		const candidates = STARTER_RECIPES.map((recipe) =>
			recipe.id === 'clearing' ? { ...recipe, content: tampered } : recipe,
		);
		const issues = validateStarterCatalog(candidates);
		expect(issues.some((issue) => issue.includes('credit'))).toBe(true);
		expect(issues.some((issue) => issue.includes('object link'))).toBe(true);
		expect(issues.some((issue) => issue.includes('not a bundled starter face'))).toBe(true);
		expect(issues.some((issue) => issue.includes('catalog weight'))).toBe(true);
	});

	it('keeps the pristine catalog free of drift issues', () => {
		expect(validateStarterCatalog()).toEqual([]);
	});
});

describe('template studio intents', () => {
	it('parses studio intents strictly', () => {
		expect(parseStudioIntent('starter:clearing')).toEqual({ kind: 'starter', id: 'clearing' });
		expect(parseStudioIntent('preset:gallery-linen')).toEqual({
			kind: 'preset',
			id: 'gallery-linen',
		});
		expect(parseStudioIntent('unknown:x')).toBeNull();
		expect(parseStudioIntent('starter:')).toBeNull();
		expect(parseStudioIntent('clearing')).toBeNull();
		expect(parseStudioIntent(null)).toBeNull();
	});

	it('resolves starter intents to a fresh copy of the recipe content', () => {
		const resolved = resolveStudioContent({ kind: 'starter', id: 'clearing' });
		const clearing = STARTER_RECIPES.find((starter) => starter.id === 'clearing')!;
		expect(resolved?.name).toBe('Clearing');
		expect(resolved?.content).toEqual(clearing.content);
		expect(resolved?.content).not.toBe(clearing.content);
		// The retired pre-catalog starters resolve to nothing (spec 37).
		expect(resolveStudioContent({ kind: 'starter', id: 'painter' })).toBeNull();
	});

	it('resolves preset intents onto a compatible host starter', () => {
		const preset = THEME_PRESETS.find((candidate) => candidate.id === 'night-gallery')!;
		const resolved = resolveStudioContent({ kind: 'preset', id: 'night-gallery' });
		expect(resolved?.name).toBe('Night Gallery');
		expect(resolved?.content.theme.backgroundColor).toBe(preset.tokens.backgroundColor);
		expect(Object.keys(resolved?.content.pages ?? {}).length).toBeGreaterThan(1);
	});

	it('extracts preset tokens without custom fonts', () => {
		const tokens = THEME_PRESETS[0].tokens;
		expect(presetTokensFromTheme({ ...tokens, customFonts: [{ name: 'X', file: 'x.woff2' }] })).toEqual(
			tokens,
		);
	});
});
