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
import conservatoryGreenTokens from './theme-presets/conservatory-green.json';
import posterWhiteTokens from './theme-presets/poster-white.json';
import studioWhiteTokens from './theme-presets/studio-white.json';
import almondPaperTokens from './theme-presets/almond-paper.json';
import backstageBlackTokens from './theme-presets/backstage-black.json';
import painterContentRaw from './starters/painter.content.json';
import photographerContentRaw from './starters/photographer.content.json';
import worksOnPaperContentRaw from './starters/works-on-paper.content.json';
import sculptorContentRaw from './starters/sculptor.content.json';
import conservatoryContentRaw from './starters/conservatory.content.json';
import mastheadContentRaw from './starters/masthead.content.json';
import atelierContentRaw from './starters/atelier.content.json';
import contactSheetContentRaw from './starters/contact-sheet.content.json';
import runwayContentRaw from './starters/runway.content.json';

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

/** Canonical discipline tags for the template picker. A template may serve
 * several disciplines; its FIRST tag is the primary (display) one. "Other" is
 * not a tag — a null/unknown discipline sees the full set. */
export type DisciplineTag =
	| 'painting'
	| 'photography'
	| 'drawing'
	| 'sculpture'
	| 'illustration-design';

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
	/** Stable registry id. A plain string so catalog production — adding and
	 * retiring templates — stays pure JSON + registry data, no type edits. */
	id: string;
	name: string;
	/** Display label for the primary discipline (the intake tile). */
	discipline: string;
	/** Every discipline this template suits, primary first. The picker filters
	 * on these; one layout is meant to serve several disciplines with
	 * discipline-appropriate imagery swapped in. */
	disciplines: DisciplineTag[];
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

// The spec-14 presets (translated Squarespace keepers, SOURCES.md) each
// support exactly the traits their starter's content detects. The revision
// pass added display-type text blocks to every batch-1 home, so those starters
// now detect longform-case-study (and atelier a freeform hero) — each preset
// grew the same traits, and starters whose old alternates (gallery-linen,
// night-gallery) no longer cover them dropped to their own preset only.
const conservatoryGreen: ThemePreset = {
	id: 'conservatory-green',
	name: 'Conservatory Green',
	description: 'Deep green walls and didone headings — a night salon for bold work.',
	tokens: presetTokens(conservatoryGreenTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

const posterWhite: ThemePreset = {
	id: 'poster-white',
	name: 'Poster White',
	description: 'Pure white behind one loud grotesque masthead — the work supplies the color.',
	tokens: presetTokens(posterWhiteTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

const studioWhite: ThemePreset = {
	id: 'studio-white',
	name: 'Studio White',
	description: 'Editorial white with quiet type and room for process notes.',
	tokens: presetTokens(studioWhiteTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
};

const almondPaper: ThemePreset = {
	id: 'almond-paper',
	name: 'Almond Paper',
	description: 'Warm cream and caramel around a disciplined grid.',
	tokens: presetTokens(almondPaperTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
};

const backstageBlack: ThemePreset = {
	id: 'backstage-black',
	name: 'Backstage Black',
	description: 'Near-black with high-contrast type — runway light for portrait work.',
	tokens: presetTokens(backstageBlackTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

export const THEME_PRESETS: ThemePreset[] = [
	galleryLinen,
	nightGallery,
	caseStudyPaper,
	graphicIndex,
	studioCorkboard,
	vitrine,
	conservatoryGreen,
	posterWhite,
	studioWhite,
	almondPaper,
	backstageBlack,
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
	disciplines: ['painting', 'drawing'],
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
	disciplines: ['photography', 'sculpture'],
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
	disciplines: ['illustration-design'],
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
	disciplines: ['drawing', 'painting'],
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
	disciplines: ['sculpture', 'photography'],
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

// ---------------------------------------------------------------------------
// Spec-14 batch 1: five starters translated from the SOURCES.md keepers
// (Mosley, Reflect, Radian, Keo, Gilden). Imagery is National Gallery of Art
// open-access media cataloged in sample-artwork-nga.ts.

function spec(
	id: string,
	folder: string,
	label: string,
	role: StarterGallerySlot['role'],
	ids: readonly string[],
): StarterGallerySpec {
	return {
		id,
		folder,
		label,
		exactImageCount: ids.length,
		slots: slots(ids, role, folder),
	};
}

const conservatoryContent: Content = starterContent(conservatoryContentRaw);

/** The night salon (from Mosley): a giant serif name in canvas display type
 * laid over a scattered collage that scrolls for screens — small cluster,
 * statement, big alternating wall, one full-width band — with a quieter
 * portraits room behind it. Every catalog Bellows hangs somewhere. */
const conservatoryRecipe: StarterRecipe = {
	id: 'conservatory',
	name: 'Conservatory',
	discipline: 'Painting',
	disciplines: ['painting', 'drawing'],
	tagline: 'A night salon — bold work scattered under a giant serif name.',
	description: 'Fifteen George Bellows paintings on deep green: a screens-deep salon wall and a portraits room.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['conservatory-green'],
	defaultThemeId: 'conservatory-green',
	readiness: 'ready',
	gallerySpecs: [
		spec('conservatory-salon', 'salon', 'Salon wall', 'selected-work', [
			'painting-nga-46557-v1',
			'painting-nga-46558-v1',
			'painting-nga-61351-v1',
			'painting-nga-61355-v1',
			'painting-nga-46559-v1',
			'painting-nga-30667-v1',
			'painting-nga-61247-v1',
			'painting-nga-134485-v1',
			'painting-nga-61354-v1',
			'painting-nga-69392-v1',
		]),
		spec('conservatory-portraits', 'portraits', 'Portraits', 'series', [
			'painting-nga-30743-v1',
			'painting-nga-57491-v1',
			'painting-nga-61352-v1',
			'painting-nga-30742-v1',
			'painting-nga-61353-v1',
		]),
	],
	content: conservatoryContent,
	coverSampleAssetId: 'painting-nga-46557-v1',
};

const mastheadContent: Content = starterContent(mastheadContentRaw);

/** The poster wall (from Reflect): a full-width bold sans masthead in canvas
 * display type crossing a three-screen collage whose images bleed off the
 * right edge, with a statement and a longer works wall behind it. Every
 * catalog Morisot hangs somewhere. */
const mastheadRecipe: StarterRecipe = {
	id: 'masthead',
	name: 'Masthead',
	discipline: 'Painting',
	disciplines: ['painting', 'illustration-design'],
	tagline: 'One loud masthead crossing a vivid collage on white.',
	description: 'Twenty Berthe Morisot paintings: a screens-deep front wall and a longer works wall.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['poster-white'],
	defaultThemeId: 'poster-white',
	readiness: 'ready',
	gallerySpecs: [
		spec('masthead-collage', 'collage', 'Front wall', 'selected-work', [
			'painting-nga-42285-v1',
			'painting-nga-89682-v1',
			'painting-nga-46660-v1',
			'painting-nga-66426-v1',
			'painting-nga-52192-v1',
			'painting-nga-46661-v1',
			'painting-nga-46525-v1',
			'painting-nga-42648-v1',
			'painting-nga-52193-v1',
			'painting-nga-52194-v1',
		]),
		spec('masthead-works', 'works', 'Works', 'series', [
			'painting-nga-52191-v1',
			'painting-nga-131028-v1',
			'painting-nga-93068-v1',
			'painting-nga-52305-v1',
			'painting-nga-164943-v1',
			'painting-nga-42652-v1',
			'painting-nga-42650-v1',
			'painting-nga-42654-v1',
			'painting-nga-42649-v1',
			'painting-nga-42653-v1',
		]),
	],
	content: mastheadContent,
	coverSampleAssetId: 'painting-nga-42285-v1',
};

const atelierContent: Content = starterContent(atelierContentRaw);

/** The studio editorial (from Radian): a full-bleed photo hero with the
 * statement under it, project rows whose images cross the right edge, a
 * color-blocked commissions band and a near-black studio band, with two
 * case-study series pages. */
const atelierRecipe: StarterRecipe = {
	id: 'atelier',
	name: 'Atelier',
	discipline: 'Photography',
	disciplines: ['photography', 'illustration-design'],
	tagline: 'A white studio editorial — hero, statement, project rows.',
	description: 'Eighteen Eugène Atget photographs across a full-bleed hero, three project rows, and two case-study series.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['studio-white'],
	defaultThemeId: 'studio-white',
	readiness: 'ready',
	gallerySpecs: [
		spec('atelier-hero', 'hero', 'Hero', 'selected-work', ['photography-nga-124991-v1']),
		spec('atelier-row-gardens', 'row-gardens', 'Gardens row', 'selected-work', [
			'photography-nga-124988-v1',
		]),
		spec('atelier-row-storefronts', 'row-storefronts', 'Storefronts row', 'selected-work', [
			'photography-nga-124978-v1',
		]),
		spec('atelier-row-interiors', 'row-interiors', 'Interiors row', 'selected-work', [
			'photography-nga-131771-v1',
		]),
		spec('atelier-strip', 'strip', 'Studio strip', 'selected-work', [
			'photography-nga-222106-v1',
			'photography-nga-124994-v1',
			'photography-nga-124979-v1',
		]),
		spec('atelier-gardens', 'gardens', 'Gardens', 'case-study', [
			'photography-nga-124980-v1',
			'photography-nga-124976-v1',
			'photography-nga-124986-v1',
			'photography-nga-112170-v1',
			'photography-nga-124975-v1',
			'photography-nga-124977-v1',
		]),
		spec('atelier-storefronts', 'storefronts', 'Storefronts', 'case-study', [
			'photography-nga-124962-v1',
			'photography-nga-92719-v1',
			'photography-nga-179424-v1',
			'photography-nga-197730-v1',
			'photography-nga-196208-v1',
		]),
	],
	content: atelierContent,
	coverSampleAssetId: 'photography-nga-124991-v1',
};

const contactSheetContent: Content = starterContent(contactSheetContentRaw);

/** The disciplined grid (from Keo): a bold statement, a marquee heading, the
 * complete set in a dense three-column grid, and a giant signature wordmark
 * closing the page the way Keo's footer does. */
const contactSheetRecipe: StarterRecipe = {
	id: 'contact-sheet',
	name: 'Contact Sheet',
	discipline: 'Photography',
	disciplines: ['photography', 'painting'],
	tagline: 'A statement, a marquee, a dense grid, and a giant signature.',
	description: 'Nine Lewis Hine photographs: the whole set in a three-column grid on cream, signed off in display type.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['almond-paper'],
	defaultThemeId: 'almond-paper',
	readiness: 'ready',
	gallerySpecs: [
		spec('contact-sheet-grid', 'sheet', 'Contact sheet', 'selected-work', [
			'photography-nga-115839-v1',
			'photography-nga-165230-v1',
			'photography-nga-212255-v1',
			'photography-nga-213988-v1',
			'photography-nga-194350-v1',
			'photography-nga-218187-v1',
			'photography-nga-92317-v1',
			'photography-nga-197799-v1',
			'photography-nga-164188-v1',
		]),
		spec('contact-sheet-colophon', 'colophon', 'Signature', 'selected-work', [
			'photography-nga-92317-v1',
		]),
		spec('contact-sheet-field-notes', 'field-notes', 'Field notes', 'series', [
			'photography-nga-92317-v1',
			'photography-nga-197799-v1',
			'photography-nga-164188-v1',
		]),
	],
	content: contactSheetContent,
	coverSampleAssetId: 'photography-nga-115839-v1',
};

const runwayContent: Content = starterContent(runwayContentRaw);

/** The dark runway (from Gilden): a full-width display wordmark over a low-lit
 * hero, then a numbered case index (01/02/03) whose images cross the right
 * edge, leading to the numbered rooms in the nav. */
const runwayRecipe: StarterRecipe = {
	id: 'runway',
	name: 'Runway',
	discipline: 'Painting',
	disciplines: ['painting', 'photography'],
	tagline: 'A dark runway — display wordmark and a numbered case index.',
	description: 'Ten Amedeo Modigliani portraits on near-black: a wordmark hero and numbered rooms 01–03.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['backstage-black'],
	defaultThemeId: 'backstage-black',
	readiness: 'ready',
	gallerySpecs: [
		spec('runway-hero', 'hero', 'Front of house', 'selected-work', [
			'painting-nga-46522-v1',
			'painting-nga-46651-v1',
		]),
		spec('runway-index', 'index', 'Numbered rooms', 'selected-work', [
			'painting-nga-46647-v1',
			'painting-nga-46520-v1',
			'painting-nga-46646-v1',
		]),
		spec('runway-portraits', 'portraits', 'Portraits', 'series', [
			'painting-nga-46647-v1',
			'painting-nga-46519-v1',
			'painting-nga-46650-v1',
			'painting-nga-46648-v1',
			'painting-nga-46646-v1',
		]),
		spec('runway-figures', 'figures', 'Figures', 'series', [
			'painting-nga-46520-v1',
			'painting-nga-46551-v1',
			'painting-nga-46649-v1',
		]),
	],
	content: runwayContent,
	coverSampleAssetId: 'painting-nga-46522-v1',
};

export const STARTER_RECIPES: StarterRecipe[] = [
	painterRecipe,
	photographerRecipe,
	illustratorRecipe,
	worksOnPaperRecipe,
	sculptorRecipe,
	conservatoryRecipe,
	mastheadRecipe,
	atelierRecipe,
	contactSheetRecipe,
	runwayRecipe,
];

export type ReadyStarterRecipe = StarterRecipe & { content: Content };

/** Only cleared recipes enter marketing or the chooser. */
export const AVAILABLE_STARTERS = STARTER_RECIPES.filter(
	(recipe): recipe is ReadyStarterRecipe =>
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

export function getStarterRecipe(id: string): StarterRecipe | undefined {
	return STARTER_RECIPES.find((recipe) => recipe.id === id);
}

/** The template picker's list for one intake discipline: templates tagged for
 * it lead, every other cleared template follows — so a discipline is a lens,
 * never a wall. "Other" and unknown disciplines see the full set up front. */
export function templatesForDiscipline(
	discipline?: DisciplineTag | null,
): { matched: ReadyStarterRecipe[]; more: ReadyStarterRecipe[] } {
	if (!discipline) return { matched: [...AVAILABLE_STARTERS], more: [] };
	return {
		matched: AVAILABLE_STARTERS.filter((recipe) => recipe.disciplines.includes(discipline)),
		more: AVAILABLE_STARTERS.filter((recipe) => !recipe.disciplines.includes(discipline)),
	};
}

/** The discipline an intake starter choice stands for: its primary tag.
 * Null (the blank "a bit of everything" answer) is the Other bucket. */
export function starterDiscipline(starterId?: string | null): DisciplineTag | null {
	if (!starterId) return null;
	return getStarterRecipe(starterId)?.disciplines[0] ?? null;
}

/** Rights-cleared sample artwork suited to one discipline, for filling a series
 * page the artist left empty. An unknown or blank starter ("a bit of
 * everything") mixes the cleared catalogs round-robin so every discipline shows. */
export function starterSampleFallbackIds(starterId?: string | null): string[] {
	const recipeIds = (recipe: StarterRecipe): string[] => [
		...new Set(
			recipe.gallerySpecs.flatMap((spec) =>
				spec.slots
					.map((slot) => slot.sampleAssetId)
					.filter(
						(id): id is string =>
							!!id && getSampleArtwork(id)?.status === 'active',
					),
			),
		),
	];
	const known = AVAILABLE_STARTERS.find((recipe) => recipe.id === starterId);
	if (known) return recipeIds(known);
	const pools = AVAILABLE_STARTERS.map(recipeIds).filter((pool) => pool.length);
	const mixed: string[] = [];
	for (let index = 0; pools.some((pool) => index < pool.length); index += 1)
		for (const pool of pools) if (index < pool.length) mixed.push(pool[index]);
	return mixed;
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
 * attached to the document. Motion is part of a template's feel, not a color
 * scheme: a preset that declares it wins, otherwise the site keeps its own. */
export function contentWithThemePreset(content: Content, theme: Theme): Content {
	return {
		...content,
		theme: {
			...JSON.parse(JSON.stringify(theme)),
			customFonts: content.theme.customFonts,
			...(theme.motion || !content.theme.motion
				? {}
				: { motion: JSON.parse(JSON.stringify(content.theme.motion)) }),
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
		if (!recipe.disciplines.length)
			issues.push(`${recipe.name} declares no disciplines for the template picker.`);
		// The picker re-hangs an artist's works into the landing page; a ready
		// template whose home page has no image group would swallow them.
		if (recipe.readiness === 'ready' && recipe.content) {
			const home = recipe.content.pages.home;
			if (!home || pageGalleryConfigs(home).length === 0)
				issues.push(`${recipe.name} home page has no image group to re-hang works into.`);
		}
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
