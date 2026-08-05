import { pageGalleryConfigs, type Content, type Theme } from '../../lib/content';
import { parseAndMigrateContent, themeSchema } from '../../lib/content-schema';
import type { EditorDoc } from './types';
import { SAMPLE_ARTWORK, aspectDifference, getSampleArtwork, sampleArtworkIdForUrl, type SampleArtwork } from './sample-artwork';
import galleryLinenTokens from './theme-presets/gallery-linen.json';
import nightGalleryTokens from './theme-presets/night-gallery.json';
import caseStudyPaperTokens from './theme-presets/case-study-paper.json';
import graphicIndexTokens from './theme-presets/graphic-index.json';
import studioCorkboardTokens from './theme-presets/studio-corkboard.json';
import vitrineTokens from './theme-presets/vitrine.json';
import painterContentRaw from './starters/painter.content.json';
import photographerContentRaw from './starters/photographer.content.json';
import worksOnPaperContentRaw from './starters/works-on-paper.content.json';
import sculptorContentRaw from './starters/sculptor.content.json';

// Template data lives in JSON files beside this module so the dev-only template
// studio can save edits without touching hashed runtime source. Both parsers run
// at module scope: a malformed file fails loudly at import time, in dev and tests.
const presetTokens = (raw: unknown): Theme => themeSchema.parse(raw) as Theme;
const starterContent = (raw: unknown): Content => parseAndMigrateContent(raw);

export type RecipeTrait =
	| 'full-bleed-media'
	| 'dense-grid'
	| 'longform-case-study'
	| 'freeform-canvas';

export interface ThemePreset {
	id: string;
	name: string;
	description: string;
	tokens: Theme;
	supportedTraits: RecipeTrait[];
}

export interface StarterGallerySlot {
	/** Stable ordered slot in the partner intake manifest. */
	id: string;
	/** Filled only after the image has passed rights and media review. */
	sampleAssetId?: string;
	width: number;
	height: number;
	aspectRatio: number;
	role: 'selected-work' | 'collection' | 'series' | 'case-study';
}

export interface StarterGallerySpec {
	id: string;
	folder: string;
	label: string;
	exactImageCount: number;
	slots: StarterGallerySlot[];
}

export type StarterReadiness = 'ready' | 'awaiting-permission' | 'awaiting-media';

export interface StarterRecipe {
	id: 'painter' | 'photographer' | 'illustrator-designer' | 'works-on-paper' | 'sculptor';
	name: string;
	discipline: string;
	tagline: string;
	description: string;
	requiredTraits: RecipeTrait[];
	compatibleThemeIds: string[];
	defaultThemeId: string;
	readiness: StarterReadiness;
	gallerySpecs: StarterGallerySpec[];
	content?: Content;
	coverSampleAssetId?: string;
}

const galleryLinen: ThemePreset = {
	id: 'gallery-linen',
	name: 'Gallery Linen',
	description: 'Warm canvas, editorial serif headings, and quiet moss details.',
	tokens: presetTokens(galleryLinenTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
};

const nightGallery: ThemePreset = {
	id: 'night-gallery',
	name: 'Night Gallery',
	description: 'Near-black walls, warm type, and copper accents for image-led work.',
	tokens: presetTokens(nightGalleryTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
};

const caseStudyPaper: ThemePreset = {
	id: 'case-study-paper',
	name: 'Case Study Paper',
	description: 'A structured reading theme for long-form projects and process notes.',
	tokens: presetTokens(caseStudyPaperTokens),
	supportedTraits: ['full-bleed-media', 'longform-case-study'],
};

const graphicIndex: ThemePreset = {
	id: 'graphic-index',
	name: 'Graphic Index',
	description: 'Compact typography and a crisp grid for visual systems and case studies.',
	tokens: presetTokens(graphicIndexTokens),
	supportedTraits: ['dense-grid', 'longform-case-study'],
};

// The two studio-wall presets deliberately do NOT support 'dense-grid': their
// starters keep every grid at two columns or fewer, and leaving the trait off
// keeps them out of painter/photographer's compatible-preset lists.
const studioCorkboard: ThemePreset = {
	id: 'studio-corkboard',
	name: 'Studio Corkboard',
	description: 'A pinboard wall — cork texture, taped drawings, typewriter headings.',
	tokens: presetTokens(studioCorkboardTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

const vitrine: ThemePreset = {
	id: 'vitrine',
	name: 'Vitrine',
	description: 'Museum-hall color blocking, centered headings, stone quiet.',
	tokens: presetTokens(vitrineTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

export const THEME_PRESETS: ThemePreset[] = [
	galleryLinen,
	nightGallery,
	caseStudyPaper,
	graphicIndex,
	studioCorkboard,
	vitrine,
];

const painterSelectedIds = [
	'painter-aic-14655-v1',
	'painter-aic-16571-v1',
	'painter-aic-15468-v1',
	'painter-aic-100829-v1',
	'painter-aic-16551-v1',
] as const;

const painterCollectionIds = [
	'painter-met-436533-v1',
	'painter-met-436528-v1',
	'painter-met-436532-v1',
	'painter-met-438817-v1',
	'painter-met-436135-v1',
] as const;

const photographerValleyIds = [
	'photographer-met-285861-v1',
	'photographer-met-286426-v1',
	'photographer-met-286457-v1',
	'photographer-met-286049-v1',
] as const;

const photographerFallsIds = [
	'photographer-met-285860-v1',
	'photographer-met-286459-v1',
	'photographer-met-286511-v1',
	'photographer-met-286425-v1',
] as const;

const photographerHorizonsIds = [
	'photographer-met-262612-v1',
	'photographer-met-283222-v1',
	'photographer-met-285772-v1',
	'photographer-met-266132-v1',
] as const;

function artworkOrThrow(id: string): SampleArtwork {
	const artwork = getSampleArtwork(id);
	if (!artwork) throw new Error(`Starter catalog references missing sample artwork “${id}”.`);
	return artwork;
}

function slots(
	ids: readonly string[],
	role: StarterGallerySlot['role'],
	prefix: string = role,
): StarterGallerySlot[] {
	return ids.map((id, index) => {
		const artwork = artworkOrThrow(id);
		return {
			id: `${prefix}-${index + 1}`,
			sampleAssetId: id,
			width: artwork.width,
			height: artwork.height,
			aspectRatio: artwork.aspectRatio,
			role,
		};
	});
}

function contractSlots(
	prefix: string,
	role: StarterGallerySlot['role'],
	dimensions: ReadonlyArray<readonly [width: number, height: number]>,
): StarterGallerySlot[] {
	return dimensions.map(([width, height], index) => ({
		id: `${prefix}-${index + 1}`,
		width,
		height,
		aspectRatio: width / height,
		role,
	}));
}

const painterContent: Content = starterContent(painterContentRaw);

const painterRecipe: StarterRecipe = {
	id: 'painter',
	name: 'Painter',
	discipline: 'Painting',
	tagline: 'A salon-style selected-work canvas with a focused collection.',
	description: 'Five selected works, five collection pieces, and a quiet gallery-led theme.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
	compatibleThemeIds: ['gallery-linen', 'night-gallery'],
	defaultThemeId: 'gallery-linen',
	readiness: 'ready',
	gallerySpecs: [
		{
			id: 'painter-selected-work',
			folder: 'selected-work',
			label: 'Selected Work',
			exactImageCount: 5,
			slots: slots(painterSelectedIds, 'selected-work'),
		},
		{
			id: 'painter-collection',
			folder: 'collection',
			label: 'Collection',
			exactImageCount: 5,
			slots: slots(painterCollectionIds, 'collection'),
		},
	],
	content: painterContent,
	coverSampleAssetId: painterSelectedIds[0],
};

const photographerContent: Content = starterContent(photographerContentRaw);

/** This starter uses a complete institutional Open Access image pack. */
const photographerRecipe: StarterRecipe = {
	id: 'photographer',
	name: 'Photographer',
	discipline: 'Photography',
	tagline: 'Three tightly edited photographic series.',
	description: 'Twelve public-domain photographs across three four-image series.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
	compatibleThemeIds: ['gallery-linen', 'night-gallery'],
	defaultThemeId: 'night-gallery',
	readiness: 'ready',
	gallerySpecs: [
		{
			id: 'photographer-yosemite-valley',
			folder: 'yosemite-valley',
			label: 'Yosemite Valley',
			exactImageCount: 4,
			slots: slots(photographerValleyIds, 'series', 'yosemite-valley'),
		},
		{
			id: 'photographer-falls-stone',
			folder: 'falls-stone',
			label: 'Falls & Stone',
			exactImageCount: 4,
			slots: slots(photographerFallsIds, 'series', 'falls-stone'),
		},
		{
			id: 'photographer-western-horizons',
			folder: 'western-horizons',
			label: 'Western Horizons',
			exactImageCount: 4,
			slots: slots(photographerHorizonsIds, 'series', 'western-horizons'),
		},
	],
	content: photographerContent,
	coverSampleAssetId: photographerValleyIds[0],
};

/**
 * The partner-led illustrator starter remains internal until permission and a
 * complete image pack arrive.
 */
const illustratorRecipe: StarterRecipe = {
	id: 'illustrator-designer',
	name: 'Illustrator / Designer',
	discipline: 'Illustration and design',
	tagline: 'Three image-led case studies with room for process.',
	description: 'Partner artwork and public-use permission are still required.',
	requiredTraits: ['dense-grid', 'longform-case-study'],
	compatibleThemeIds: ['graphic-index'],
	defaultThemeId: 'graphic-index',
	readiness: 'awaiting-permission',
	gallerySpecs: ['Case Study One', 'Case Study Two', 'Case Study Three'].map((label, index) => {
		const number = index + 1;
		return {
			id: `illustrator-case-study-${number}`,
			folder: `case-study-${number}`,
			label,
			exactImageCount: 4,
			slots: contractSlots(`illustrator-case-study-${number}`, 'case-study', [
				[2400, 1600],
				[2000, 2000],
				[1600, 2400],
				[2400, 1600],
			]),
		};
	}),
};

const worksOnPaperWallIds = [
	'works-on-paper-met-337497-v1',
	'works-on-paper-met-344210-v1',
	'works-on-paper-met-335537-v1',
	'works-on-paper-met-335536-v1',
] as const;

const worksOnPaperFigureIds = [
	'works-on-paper-met-333943-v1',
	'works-on-paper-met-333942-v1',
	'works-on-paper-met-334326-v1',
] as const;

const worksOnPaperFieldIds = [
	'works-on-paper-met-337491-v1',
	'works-on-paper-met-336318-v1',
	'works-on-paper-met-336481-v1',
] as const;

const worksOnPaperContent: Content = starterContent(worksOnPaperContentRaw);

/** The studio pinboard: drawings taped and nailed to a cork wall, deliberately
 * overlapping, with two sketchbook sub-pages behind an index. */
const worksOnPaperRecipe: StarterRecipe = {
	id: 'works-on-paper',
	name: 'Works on paper',
	discipline: 'Drawing',
	tagline: 'A studio pinboard — drawings taped and nailed to a cork wall.',
	description: 'Ten Open Access drawings pinned to a corkboard wall, with two sketchbook sub-pages.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['studio-corkboard', 'vitrine'],
	defaultThemeId: 'studio-corkboard',
	readiness: 'ready',
	gallerySpecs: [
		{
			id: 'works-on-paper-wall',
			folder: 'wall',
			label: 'Wall',
			exactImageCount: 4,
			slots: slots(worksOnPaperWallIds, 'selected-work', 'wall'),
		},
		{
			id: 'works-on-paper-figure-studies',
			folder: 'figure-studies',
			label: 'Figure studies',
			exactImageCount: 3,
			slots: slots(worksOnPaperFigureIds, 'series', 'figure-studies'),
		},
		{
			id: 'works-on-paper-field-notes',
			folder: 'field-notes',
			label: 'Field notes',
			exactImageCount: 3,
			slots: slots(worksOnPaperFieldIds, 'series', 'field-notes'),
		},
	],
	content: worksOnPaperContent,
	coverSampleAssetId: worksOnPaperWallIds[0],
};

const sculptorWorkIds = [
	'sculptor-met-544227-v1',
	'sculptor-met-254587-v1',
	'sculptor-met-255417-v1',
	'sculptor-met-251838-v1',
] as const;

const sculptorStudioIds = [
	'sculptor-met-257603-v1',
	'sculptor-met-248579-v1',
	'sculptor-met-248268-v1',
	'sculptor-met-255275-v1',
] as const;

const sculptorContent: Content = starterContent(sculptorContentRaw);

/** The museum walk: one work per full-height color-blocked section with scroll
 * motion, plus a case-study Studio page. Grids stay at two columns so the
 * starter never detects the dense-grid trait. */
const sculptorRecipe: StarterRecipe = {
	id: 'sculptor',
	name: 'Sculptor',
	discipline: 'Sculpture',
	tagline: 'A museum walk — one work per color-blocked hall.',
	description: 'Eight Open Access sculptures in full-height vitrine sections with scroll motion.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['vitrine', 'studio-corkboard'],
	defaultThemeId: 'vitrine',
	readiness: 'ready',
	gallerySpecs: [
		// One-work-per-hall: each home section binds its own single-image folder.
		...sculptorWorkIds.map((id, index) => ({
			id: `sculptor-work-${index + 1}`,
			folder: `work-${index + 1}`,
			label: `Hall ${index + 1}`,
			exactImageCount: 1,
			slots: slots([id], 'selected-work', `work-${index + 1}`),
		})),
		{
			id: 'sculptor-studio',
			folder: 'studio',
			label: 'Studio',
			exactImageCount: 4,
			slots: slots(sculptorStudioIds, 'series', 'studio'),
		},
	],
	content: sculptorContent,
	coverSampleAssetId: sculptorWorkIds[0],
};

export const STARTER_RECIPES: StarterRecipe[] = [
	painterRecipe,
	photographerRecipe,
	illustratorRecipe,
	worksOnPaperRecipe,
	sculptorRecipe,
];

/** Only cleared recipes enter marketing or the chooser. */
export const AVAILABLE_STARTERS = STARTER_RECIPES.filter(
	(recipe): recipe is StarterRecipe & { content: Content } =>
		recipe.readiness === 'ready' &&
		!!recipe.content &&
		recipe.gallerySpecs.every((spec) =>
			spec.slots.length === spec.exactImageCount &&
			spec.slots.every(
				(slot) =>
					!!slot.sampleAssetId &&
					getSampleArtwork(slot.sampleAssetId)?.status === 'active',
			),
		),
);

export function getStarterRecipe(id: StarterRecipe['id']): StarterRecipe | undefined {
	return STARTER_RECIPES.find((recipe) => recipe.id === id);
}

export function detectDocumentTraits(doc: Pick<EditorDoc, 'content'>): RecipeTrait[] {
	const traits = new Set<RecipeTrait>();
	for (const page of Object.values(doc.content.pages)) {
		const galleries = pageGalleryConfigs(page);
		if (galleries.length) traits.add('full-bleed-media');
		for (const gallery of galleries) {
			if (gallery.layout === 'grid' && (gallery.columns ?? 3) >= 3) traits.add('dense-grid');
			if (gallery.layout !== 'grid') traits.add('freeform-canvas');
		}
		if (
			(page.children?.length ?? 0) > 0 ||
			(page.blocks ?? []).filter((block) => block.type === 'text' || block.type === 'images').length >= 3
		)
			traits.add('longform-case-study');
	}
	return [...traits];
}

export function compatibleThemePresets(doc: Pick<EditorDoc, 'content'>): ThemePreset[] {
	const traits = detectDocumentTraits(doc);
	return THEME_PRESETS.filter((preset) => traits.every((trait) => preset.supportedTraits.includes(trait)));
}

/** Apply only design tokens. User pages, media, copy, and custom font files stay
 * attached to the document. */
export function contentWithThemePreset(content: Content, theme: Theme): Content {
	return {
		...content,
		theme: {
			...JSON.parse(JSON.stringify(theme)),
			customFonts: content.theme.customFonts,
		},
	};
}

/** Starter content is repo data with a rights contract: every image must be a
 * catalog sample shown with its required credit, and nothing may depend on files
 * that exist only in a browser session (uploads) or outside the sample folders. */
function starterContentIssues(
	recipe: StarterRecipe,
	content: Content,
	artworkCatalog: ReadonlyMap<string, SampleArtwork>,
): string[] {
	const issues: string[] = [];
	for (const [folder, gallery] of Object.entries(content.galleries)) {
		for (const [filename, item] of Object.entries(gallery.items)) {
			const where = `${recipe.name} / ${folder} / ${filename}`;
			if (!item.sampleAssetId) {
				issues.push(`${where} is not a catalog sample.`);
				continue;
			}
			const artwork = artworkCatalog.get(item.sampleAssetId);
			if (!artwork) {
				issues.push(`${where} references missing sample ${item.sampleAssetId}.`);
				continue;
			}
			if (recipe.readiness === 'ready' && artwork.status !== 'active')
				issues.push(`${where} references ${artwork.status} media.`);
			if (item.layout && Math.abs(item.layout.ar - artwork.aspectRatio) / artwork.aspectRatio > 0.005)
				issues.push(`${where} layout aspect ratio drifts from the catalog image.`);
			if ((item.description ?? '') !== artwork.credit)
				issues.push(`${where} must keep the catalog credit line.`);
			if ((item.link ?? '') !== artwork.objectUrl)
				issues.push(`${where} must keep the catalog object link.`);
		}
	}
	if (content.profile.image !== '' && !sampleArtworkIdForUrl(content.profile.image))
		issues.push(`${recipe.name} profile image must be empty or a catalog sample.`);
	const fileDependencies: Array<[label: string, value: unknown]> = [
		['site.logoImage', content.site.logoImage],
		['site.footerImage', content.site.footerImage],
		['site.ogImage', content.site.ogImage],
		['site.signature.image', content.site.signature?.image],
		['site.creative.cursorImage', content.site.creative?.cursorImage],
	];
	for (const [label, value] of fileDependencies)
		if (value) issues.push(`${recipe.name} ${label} depends on a file the template cannot ship.`);
	if (content.theme.customFonts?.length)
		issues.push(`${recipe.name} uses custom font files the template cannot ship.`);
	if (content.resume?.url && !/^https?:/i.test(content.resume.url))
		issues.push(`${recipe.name} résumé must be empty or an absolute link.`);
	for (const [key, page] of Object.entries(content.pages)) {
		if (page.thumbnail) issues.push(`${recipe.name} page “${key}” thumbnail depends on a repo file.`);
		for (const block of page.blocks ?? [])
			if (block.type === 'shots' && (block.src || block.assetId))
				issues.push(`${recipe.name} page “${key}” shots block depends on an uploaded clip.`);
	}
	for (const product of content.store?.products ?? [])
		if (product.image) issues.push(`${recipe.name} product “${product.name}” image depends on a repo file.`);
	return issues;
}

export function validateStarterCatalog(
	recipes: readonly StarterRecipe[] = STARTER_RECIPES,
	themes: readonly ThemePreset[] = THEME_PRESETS,
	artworkCatalog: ReadonlyMap<string, SampleArtwork> = SAMPLE_ARTWORK,
): string[] {
	const issues: string[] = [];
	const recipeIds = new Set<string>();
	const sampleIds = new Set<string>();
	for (const artwork of artworkCatalog.values()) {
		if (sampleIds.has(artwork.id)) issues.push(`Duplicate sample artwork id: ${artwork.id}`);
		sampleIds.add(artwork.id);
		if (artwork.width <= 0 || artwork.height <= 0 || artwork.aspectRatio <= 0)
			issues.push(`${artwork.id} is missing valid dimensions.`);
		if (!artwork.rightsProof || !artwork.objectUrl || !artwork.accessionNumber)
			issues.push(`${artwork.id} is missing rights evidence.`);
		const replacement = artwork.replacementId
			? artworkCatalog.get(artwork.replacementId)
			: undefined;
		if (artwork.replacementId && !replacement) issues.push(`${artwork.id} has a missing replacement.`);
		if (replacement && aspectDifference(artwork, replacement) > 0.03)
			issues.push(`${artwork.id} replacement differs in aspect ratio by more than 3%.`);
	}
	for (const recipe of recipes) {
		if (recipeIds.has(recipe.id)) issues.push(`Duplicate starter recipe id: ${recipe.id}`);
		recipeIds.add(recipe.id);
		const defaultTheme = themes.find((theme) => theme.id === recipe.defaultThemeId);
		if (!defaultTheme) issues.push(`${recipe.name} has a missing default theme.`);
		else if (!recipe.requiredTraits.every((trait) => defaultTheme.supportedTraits.includes(trait)))
			issues.push(`${recipe.name} has an incompatible default theme.`);
		if (!recipe.compatibleThemeIds.includes(recipe.defaultThemeId))
			issues.push(`${recipe.name} does not include its default theme in compatible themes.`);
		for (const themeId of recipe.compatibleThemeIds) {
			const theme = themes.find((candidate) => candidate.id === themeId);
			if (!theme) issues.push(`${recipe.name} references missing theme ${themeId}.`);
			else if (!recipe.requiredTraits.every((trait) => theme.supportedTraits.includes(trait)))
				issues.push(`${theme.name} does not support every ${recipe.name} trait.`);
		}
		if (recipe.readiness === 'ready' && !recipe.content)
			issues.push(`${recipe.name} is ready but has no recipe content.`);
		if (recipe.readiness === 'ready' && !recipe.coverSampleAssetId)
			issues.push(`${recipe.name} is ready but has no cover sample.`);
		const slotIds = new Set<string>();
		for (const spec of recipe.gallerySpecs) {
			if (spec.slots.length !== spec.exactImageCount)
				issues.push(`${recipe.name} / ${spec.label} must contain exactly ${spec.exactImageCount} ordered slots.`);
			for (const slot of spec.slots) {
				if (slotIds.has(slot.id)) issues.push(`${recipe.name} has duplicate slot id ${slot.id}.`);
				slotIds.add(slot.id);
				if (slot.width <= 0 || slot.height <= 0 || slot.aspectRatio <= 0)
					issues.push(`${spec.id} / ${slot.id} is missing valid dimensions.`);
				if (Math.abs(slot.aspectRatio - slot.width / slot.height) > 0.0001)
					issues.push(`${spec.id} / ${slot.id} has an incorrect aspect ratio.`);
				if (!slot.sampleAssetId) {
					if (recipe.readiness === 'ready')
						issues.push(`${recipe.name} / ${slot.id} is ready but has no cleared sample.`);
					continue;
				}
				const artwork = artworkCatalog.get(slot.sampleAssetId);
				if (!artwork) issues.push(`${spec.id} references missing sample ${slot.sampleAssetId}.`);
				else {
					if (
						slot.width !== artwork.width ||
						slot.height !== artwork.height ||
						Math.abs(slot.aspectRatio - artwork.aspectRatio) > 0.0001
					)
						issues.push(`${spec.id} has incorrect dimensions for ${slot.sampleAssetId}.`);
					if (recipe.readiness === 'ready' && artwork.status !== 'active')
						issues.push(`${recipe.name} is ready but references ${artwork.status} media.`);
				}
			}
			if (recipe.content) {
				const entries = recipe.content.galleries[spec.folder]?.items;
				if (!entries) issues.push(`${recipe.name} is missing the ${spec.folder} gallery binding.`);
				else if (Object.keys(entries).length !== spec.exactImageCount)
					issues.push(`${recipe.name} / ${spec.label} content has the wrong image count.`);
			}
		}
		if (
			recipe.coverSampleAssetId &&
			!artworkCatalog.has(recipe.coverSampleAssetId)
		)
			issues.push(`${recipe.name} references a missing cover sample.`);
		if (recipe.content) issues.push(...starterContentIssues(recipe, recipe.content, artworkCatalog));
	}
	return issues;
}
