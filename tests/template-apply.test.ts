// The discipline template picker + auto-placement (BACKLOG spec 11): applying
// a landing-page template swaps the home page and theme, re-hangs the artist's
// own works into the template's sample positions in order, appends overflow
// after the last position, and preserves everything else — so switching
// templates re-flows the same works instead of duplicating them. The store
// action wraps applyTemplateToDoc in a single commitDoc call, which is what
// makes an apply one undo entry (same contract as buildPagesFromWorkbench).
import { describe, expect, it } from 'vitest';
import { blankDoc, initDocFromContent } from '../src/editor/lib/content-init';
import { uid } from '../src/editor/lib/assets';
import { pageGalleryConfigs } from '../src/lib/content';
import { getSampleArtwork } from '../src/editor/lib/sample-artwork';
import {
	AVAILABLE_STARTERS,
	STARTER_RECIPES,
	THEME_PRESETS,
	starterDiscipline,
	templatesForDiscipline,
	validateStarterCatalog,
	type DisciplineTag,
	type ReadyStarterRecipe,
} from '../src/editor/lib/templates';
import { SAMPLE_ARTWORK } from '../src/editor/lib/sample-artwork';
import { applyTemplateToDoc } from '../src/editor/store';
import { parseAndMigrateEditorDoc } from '../src/editor/lib/doc-schema';
import type { Content, GalleryConfig, PageConfig } from '../src/lib/content';
import type { EditorDoc, ImageEntry } from '../src/editor/lib/types';

function ready(id: string): ReadyStarterRecipe {
	const recipe = AVAILABLE_STARTERS.find((candidate) => candidate.id === id);
	if (!recipe) throw new Error(`Starter “${id}” is not available in this catalog.`);
	return recipe;
}

function uploadedWork(name: string): ImageEntry {
	return {
		id: uid('e'),
		filename: `${name}.jpg`,
		meta: { title: name, alt: name, description: '', link: '', cropZoom: 1.2 },
		assetId: uid('asset'),
		sampleAssetId: null,
	};
}

/** A doc as the workbench build leaves it: the artist's works hung on home
 * (the blank starter's 'selected-works' group) plus one series page. */
function builtDoc(workCount: number, seriesLabel = 'Harbor paintings'): {
	doc: EditorDoc;
	works: ImageEntry[];
	seriesKey: string;
} {
	const doc = blankDoc();
	doc.content.site.name = 'Ana Torres';
	doc.content.profile.bio = 'Painter working from a harbor studio.';
	const works = Array.from({ length: workCount }, (_, index) => uploadedWork(`work-${index + 1}`));
	doc.galleries['selected-works'] = works;
	const seriesKey = seriesLabel.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
	doc.content.pages[seriesKey] = {
		title: `${seriesLabel} — {name}`,
		label: seriesLabel,
		gallery: { folder: seriesKey, alt: seriesLabel, order: 'asc' },
		blocks: [{ id: 'gallery', type: 'gallery' }],
		sections: [{ id: 'main', name: 'Main section', blockIds: ['gallery'] }],
	};
	doc.content.nav.push({ path: seriesKey, label: seriesLabel });
	doc.galleries[seriesKey] = [uploadedWork('series-piece')];
	return { doc, works, seriesKey };
}

/** Every home image-group entry, in gallery-config order — the wall order the
 * next template pick re-collects works in. */
function homeEntries(doc: EditorDoc): ImageEntry[] {
	const folders = [
		...new Set(pageGalleryConfigs(doc.content.pages.home).map((config) => config.folder)),
	];
	return folders.flatMap((folder) => doc.galleries[folder] ?? []);
}

describe('applyTemplateToDoc', () => {
	it('re-hangs works into the template positions in order, overflow after the last', () => {
		const clearing = ready('clearing');
		const { doc, works, seriesKey } = builtDoc(8);
		const before = JSON.parse(JSON.stringify(doc));

		const { doc: applied, report } = applyTemplateToDoc(doc, clearing.content);

		// The input document is untouched — the store's single commitDoc around
		// this pure function is what makes an apply exactly one undo entry.
		expect(doc).toEqual(before);

		// Clearing's home hangs one 'clearing' freeform group of six slots.
		const homeFolders = pageGalleryConfigs(applied.content.pages.home).map(
			(config) => config.folder,
		);
		expect(homeFolders).toEqual(['clearing']);
		const entries = applied.galleries.clearing;
		expect(entries.map((entry) => entry.assetId)).toEqual(works.map((work) => work.assetId));

		// The first six adopt the template slots' canvas positions; the work
		// keeps its own image, captions, and crop. Overflow auto-flows (no layout).
		const slotLayouts = initDocFromContent(clearing.content).galleries.clearing.map(
			(slot) => slot.meta.layout,
		);
		for (let index = 0; index < 6; index += 1) {
			expect(entries[index].meta.layout).toEqual(slotLayouts[index]);
			expect(entries[index].meta.title).toBe(works[index].meta.title);
			expect(entries[index].meta.cropZoom).toBe(1.2);
		}
		expect(entries[6].meta.layout).toBeUndefined();
		expect(entries[7].meta.layout).toBeUndefined();
		expect(report).toEqual({ rehung: 6, overflow: 2, samplesLeft: 0 });

		// Template supplies layout + theme, not identity: name, bio, and the
		// artist's series page all survive; the theme is the template's.
		expect(applied.content.site.name).toBe('Ana Torres');
		expect(applied.content.profile.bio).toBe('Painter working from a harbor studio.');
		expect(applied.content.pages[seriesKey]).toEqual(doc.content.pages[seriesKey]);
		expect(applied.galleries[seriesKey]).toEqual(doc.galleries[seriesKey]);
		expect(applied.content.nav).toEqual(doc.content.nav);
		expect(applied.content.theme.backgroundColor).toBe(clearing.content.theme.backgroundColor);
		expect(applied.content.theme.fontFamily).toBe(clearing.content.theme.fontFamily);

		// The blank home's old group is dropped; nothing else references it.
		expect(applied.galleries['selected-works']).toBeUndefined();
		expect(applied.content.galleries['selected-works']).toBeUndefined();
	});

	it('keeps the remaining sample frames when the artist has fewer works than slots', () => {
		const clearing = ready('clearing');
		const { doc, works } = builtDoc(2);

		const { doc: applied, report } = applyTemplateToDoc(doc, clearing.content);

		const entries = applied.galleries.clearing;
		expect(entries).toHaveLength(6);
		expect(entries.slice(0, 2).map((entry) => entry.assetId)).toEqual(
			works.map((work) => work.assetId),
		);
		for (const slot of entries.slice(2)) {
			expect(slot.assetId).toBeNull();
			const artwork = getSampleArtwork(slot.sampleAssetId ?? '');
			expect(artwork?.status).toBe('active');
			// The rights contract travels with the remaining samples.
			expect(slot.meta.description).toBe(artwork?.credit);
			expect(slot.meta.link).toBe(artwork?.objectUrl);
		}
		expect(report).toEqual({ rehung: 2, overflow: 0, samplesLeft: 4 });
	});

	it('applies with rights-cleared samples when the artist has no photos', () => {
		const signal = ready('signal');
		const doc = blankDoc();
		doc.content.site.name = 'Ana Torres';

		const { doc: applied, report } = applyTemplateToDoc(doc, signal.content);

		const entries = homeEntries(applied);
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect(entry.assetId).toBeNull();
			const artwork = getSampleArtwork(entry.sampleAssetId ?? '');
			expect(artwork?.status).toBe('active');
			expect(entry.meta.description).toBe(artwork?.credit);
			expect(entry.meta.link).toBe(artwork?.objectUrl);
		}
		expect(report.rehung).toBe(0);
		expect(report.samplesLeft).toBe(entries.length);
		expect(applied.content.site.name).toBe('Ana Torres');
	});

	it('re-applying a different template re-flows the same works without duplicates', () => {
		const clearing = ready('clearing');
		const masthead = ready('masthead');
		const { doc, works, seriesKey } = builtDoc(3);

		const first = applyTemplateToDoc(doc, clearing.content).doc;
		const second = applyTemplateToDoc(first, masthead.content).doc;

		// The same three works, once each, in the original order.
		const uploads = homeEntries(second).filter((entry) => entry.assetId !== null);
		expect(uploads.map((entry) => entry.assetId)).toEqual(works.map((work) => work.assetId));
		const everywhere = Object.values(second.galleries)
			.flat()
			.filter((entry) => entry.assetId !== null);
		// Home works plus the untouched series piece — nothing accumulated.
		expect(everywhere).toHaveLength(works.length + 1);

		// Clearing's home group is gone; Masthead's took its place.
		expect(second.galleries.clearing).toBeUndefined();
		expect(second.galleries.collage).toBeDefined();
		expect(second.content.pages[seriesKey]).toBeDefined();
	});

	it('keeps wall order across multi-group homes by appending overflow to the last group', () => {
		const promenade = ready('promenade');
		const clearing = ready('clearing');
		const { doc, works } = builtDoc(8);

		// Promenade's home hangs one work per hall (six single-slot groups).
		const halls = applyTemplateToDoc(doc, promenade.content).doc;
		const hallFolders = pageGalleryConfigs(halls.content.pages.home).map(
			(config) => config.folder,
		);
		expect(hallFolders).toEqual([
			'hall-1',
			'hall-1-side',
			'hall-2',
			'hall-2-side',
			'hall-3',
			'hall-3-side',
		]);
		for (let hall = 0; hall < 6; hall += 1)
			expect(halls.galleries[hallFolders[hall]][0].assetId).toBe(works[hall].assetId);
		expect(
			halls.galleries['hall-3-side'].slice(1).map((entry) => entry.assetId),
		).toEqual([works[6].assetId, works[7].assetId]);

		// Re-collecting from the halls keeps the original order.
		const back = applyTemplateToDoc(halls, clearing.content).doc;
		expect(
			back.galleries.clearing.map((entry) => entry.assetId),
		).toEqual(works.map((work) => work.assetId));
	});

	it('carries the template’s bundled faces; the artist’s own font keeps its name', () => {
		const { doc } = builtDoc(3);
		doc.content.theme.customFonts = [
			{ name: 'Cormorant', file: 'fonts/my-cormorant.woff2' },
			{ name: 'Studio Sans', file: 'fonts/studio-sans.woff2' },
		];

		// A template that declares a face the artist doesn't have: it comes along.
		const applied = applyTemplateToDoc(doc, ready('conservatory').content).doc;
		const fonts = applied.content.theme.customFonts ?? [];
		expect(fonts).toContainEqual({
			name: 'Gilda Display',
			file: 'fonts/gilda-display.woff2',
			weight: '400',
		});
		expect(fonts).toContainEqual({ name: 'Studio Sans', file: 'fonts/studio-sans.woff2' });

		// A name collision: the artist's uploaded font keeps the name.
		const collided = applyTemplateToDoc(doc, ready('marmalade').content).doc;
		const collidedFonts = collided.content.theme.customFonts ?? [];
		expect(collidedFonts.filter((font) => font.name === 'Cormorant')).toEqual([
			{ name: 'Cormorant', file: 'fonts/my-cormorant.woff2' },
		]);
	});

	it('renames template folders that collide with a page the artist keeps', () => {
		const clearing = ready('clearing');
		const { doc } = builtDoc(1, 'Clearing');
		const seriesEntries = doc.galleries.clearing;

		const { doc: applied } = applyTemplateToDoc(doc, clearing.content);

		// The artist's "Clearing" series page keeps its folder; the template's
		// group hangs under a renamed one.
		expect(applied.galleries.clearing).toEqual(seriesEntries);
		expect(applied.content.pages.clearing.gallery?.folder).toBe('clearing');
		const homeFolders = pageGalleryConfigs(applied.content.pages.home).map(
			(config) => config.folder,
		);
		expect(homeFolders).toEqual(['clearing-2']);
		// One work re-hung into the first slot, five sample frames remain.
		expect(applied.galleries['clearing-2']).toHaveLength(6);
		expect(applied.galleries['clearing-2'][0].assetId).not.toBeNull();
	});

	it('remaps the template phone arrangement onto the hung works (regression: stale ids wedged the draft)', () => {
		const clearing = ready('clearing');
		const content = JSON.parse(JSON.stringify(clearing.content)) as Content;
		const homeConfig = (page: PageConfig): GalleryConfig => {
			const config =
				page.gallery ??
				page.blocks?.flatMap((block) => (block.type === 'images' ? [block.gallery] : []))[0];
			if (!config) throw new Error('template home has no gallery config');
			return config;
		};
		// Author a phone arrangement on the template pinned to its slot ids, the
		// way a studio-saved starter would carry one.
		const slotIds = Object.values(content.galleries[homeConfig(content.pages.home).folder].items).map(
			(meta) => meta.id,
		);
		homeConfig(content.pages.home).mobile = { mode: 'custom', order: slotIds.map((id) => `image:${id}`) };

		const { doc, works, seriesKey } = builtDoc(3);
		doc.content.galleries[seriesKey] = { items: {} }; // content-level twin builtDoc omits
		const { doc: applied, report } = applyTemplateToDoc(doc, content);
		expect(report.rehung).toBe(3);

		// The arrangement now points at the hung works' fresh ids (unfilled
		// sample slots keep theirs), so the applied doc must survive a browser
		// save → load round trip instead of failing validation.
		const appliedOrder = homeConfig(applied.content.pages.home).mobile?.order ?? [];
		const appliedEntries = applied.galleries[homeConfig(applied.content.pages.home).folder];
		expect(appliedOrder).toEqual(appliedEntries.map((entry) => `image:${entry.id}`));
		expect(appliedEntries.slice(0, 3).map((entry) => entry.assetId)).toEqual(
			works.map((work) => work.assetId),
		);
		expect(() => parseAndMigrateEditorDoc(JSON.parse(JSON.stringify(applied)))).not.toThrow();
	});
});

describe('parseAndMigrateEditorDoc phone-arrangement self-heal', () => {
	it('drops a stale phone arrangement instead of refusing to open the draft', () => {
		// A draft as the pre-fix applyTemplate could leave it: home's phone
		// arrangement pins an image id that no longer exists in the group.
		const { doc, seriesKey } = builtDoc(2);
		doc.content.galleries[seriesKey] = { items: {} }; // content-level twin builtDoc omits
		const home = doc.content.pages.home;
		const config = home.gallery ?? (home.blocks?.find((block) => block.type === 'images') as { gallery: GalleryConfig } | undefined)?.gallery;
		if (!config) throw new Error('blank home has no gallery config');
		config.mobile = { mode: 'custom', order: ['image:ghost-id-from-a-replaced-slot'] };

		const healed = parseAndMigrateEditorDoc(JSON.parse(JSON.stringify(doc)));
		const healedConfig =
			healed.content.pages.home.gallery ??
			(healed.content.pages.home.blocks?.find((block) => block.type === 'images') as { gallery: GalleryConfig } | undefined)?.gallery;
		expect(healedConfig?.mobile).toBeUndefined();

		// A valid arrangement on another page is untouched by the heal.
		const again = builtDoc(2);
		again.doc.content.galleries[again.seriesKey] = { items: {} };
		const seriesConfig = again.doc.content.pages['harbor-paintings'].gallery;
		if (!seriesConfig) throw new Error('series page has no gallery config');
		again.doc.galleries['harbor-paintings'] = [again.works[0]];
		seriesConfig.mobile = { mode: 'custom', order: [`image:${again.works[0].id}`] };
		const kept = parseAndMigrateEditorDoc(JSON.parse(JSON.stringify(again.doc)));
		expect(kept.content.pages['harbor-paintings'].gallery?.mobile).toEqual(seriesConfig.mobile);
	});
});

describe('template registry disciplines', () => {
	it('leads with the intake discipline and always shows the full set', () => {
		const photography = templatesForDiscipline('photography');
		expect(photography.matched.length).toBeGreaterThanOrEqual(2);
		for (const recipe of photography.matched)
			expect(recipe.disciplines).toContain('photography');
		expect(photography.matched.length + photography.more.length).toBe(
			AVAILABLE_STARTERS.length,
		);

		// The "Other" bucket (blank intake) sees everything up front.
		const other = templatesForDiscipline(null);
		expect(other.matched).toEqual(AVAILABLE_STARTERS);
		expect(other.more).toHaveLength(0);
	});

	it('serves every discipline a look, and every look the rest of the catalog', () => {
		const disciplines: DisciplineTag[] = [
			'painting',
			'photography',
			'drawing',
			'sculpture',
			'illustration-design',
		];
		for (const discipline of disciplines) {
			const { matched, more } = templatesForDiscipline(discipline);
			expect(matched.length, `${discipline} routes nowhere`).toBeGreaterThanOrEqual(1);
			// A discipline is a lens, never a wall: the rest still follow.
			expect(matched.length + more.length).toBe(AVAILABLE_STARTERS.length);
		}
		// Spec 37 retired the two legacy sculpture-tagged starters, so sculpture
		// leads with Still room alone until spec-14 batch 3 lands more; every
		// other discipline still leads with two or more.
		expect(templatesForDiscipline('sculpture').matched.map((recipe) => recipe.id)).toEqual([
			'still-room',
		]);
		for (const discipline of disciplines.filter((tag) => tag !== 'sculpture'))
			expect(templatesForDiscipline(discipline).matched.length).toBeGreaterThanOrEqual(2);
	});

	it('derives the picker discipline from the intake starter', () => {
		expect(starterDiscipline('conservatory')).toBe('painting');
		expect(starterDiscipline('still-room')).toBe('sculpture');
		// The retired pre-catalog starters route nowhere (spec 37).
		expect(starterDiscipline('painter')).toBeNull();
		expect(starterDiscipline('sculptor')).toBeNull();
		expect(starterDiscipline(null)).toBeNull();
		expect(starterDiscipline('not-a-starter')).toBeNull();
	});

	it('validates discipline tags and a hangable home page', () => {
		expect(validateStarterCatalog()).toEqual([]);
		const sample = STARTER_RECIPES.find((recipe) => recipe.id === 'clearing')!;
		const untagged = { ...sample, id: 'untagged', name: 'Untagged', disciplines: [] };
		expect(
			validateStarterCatalog([untagged], THEME_PRESETS, SAMPLE_ARTWORK).join('\n'),
		).toContain('declares no disciplines');
		const bareHome = {
			...sample,
			id: 'bare-home',
			name: 'Bare home',
			content: {
				...sample.content!,
				pages: {
					...sample.content!.pages,
					home: { title: 'Home', blocks: [], sections: [] },
				},
			},
		};
		expect(
			validateStarterCatalog([bareHome], THEME_PRESETS, SAMPLE_ARTWORK).join('\n'),
		).toContain('no image group');
	});
});
