// The starter catalog. Spec 37 retired the five pre-catalog starters (painter,
// photographer, illustrator-designer, works-on-paper, sculptor): the spec-14
// catalog is the product, so those layouts no longer appear in the intake, the
// picker, or the template studio. Their sample artwork stays in
// sample-artwork.ts on purpose — a draft an artist built from a legacy starter
// still references those images, and must keep parsing, rendering, and
// publishing exactly as before. Removal is from the catalog surfaces only.
import { pageGalleryConfigs, type Content, type Theme } from '../../lib/content';
import { parseAndMigrateContent, themeSchema } from '../../lib/content-schema';
import type { EditorDoc } from './types';
import { SAMPLE_ARTWORK, aspectDifference, getSampleArtwork, sampleArtworkIdForUrl, type SampleArtwork } from './sample-artwork';
import { STARTER_FONT_FACES, starterFontForCustomFont } from './starter-fonts';
import { withBase } from '../../portfolio/types';
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
import plasterWhiteTokens from './theme-presets/plaster-white.json';
import stillCreamTokens from './theme-presets/still-cream.json';
import signalBlueTokens from './theme-presets/signal-blue.json';
import clearingWhiteTokens from './theme-presets/clearing-white.json';
import marmaladeWhiteTokens from './theme-presets/marmalade-white.json';
import conservatoryContentRaw from './starters/conservatory.content.json';
import mastheadContentRaw from './starters/masthead.content.json';
import atelierContentRaw from './starters/atelier.content.json';
import contactSheetContentRaw from './starters/contact-sheet.content.json';
import runwayContentRaw from './starters/runway.content.json';
import promenadeContentRaw from './starters/promenade.content.json';
import stillRoomContentRaw from './starters/still-room.content.json';
import signalContentRaw from './starters/signal.content.json';
import clearingContentRaw from './starters/clearing.content.json';
import marmaladeContentRaw from './starters/marmalade.content.json';

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

// The two studio-wall presets deliberately do NOT support 'dense-grid': a
// document whose grids stay at two columns or fewer keeps the trait off, and
// only such documents may wear these presets.
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

// Spec-14 batch-2 presets (Bergen, Cimen, Aue Sobol, Arthur, Quinn keepers).
const plasterWhite: ThemePreset = {
	id: 'plaster-white',
	name: 'Plaster White',
	description: 'White halls, didone headings, and full-width painted bands.',
	tokens: presetTokens(plasterWhiteTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

const stillCream: ThemePreset = {
	id: 'still-cream',
	name: 'Still Cream',
	description: 'Warm cream and taupe around patient object studies.',
	tokens: presetTokens(stillCreamTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
};

const signalBlue: ThemePreset = {
	id: 'signal-blue',
	name: 'Signal Blue',
	description: 'Heavy ink-blue type on white — every headline a signal.',
	tokens: presetTokens(signalBlueTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
};

const clearingWhite: ThemePreset = {
	id: 'clearing-white',
	name: 'Clearing White',
	description: 'White space as a material — quiet type, bone accents.',
	tokens: presetTokens(clearingWhiteTokens),
	supportedTraits: ['full-bleed-media', 'freeform-canvas'],
};

const marmaladeWhite: ThemePreset = {
	id: 'marmalade-white',
	name: 'Marmalade',
	description: 'Off-white, one hot orange, and a giant condensed serif.',
	tokens: presetTokens(marmaladeWhiteTokens),
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
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
	plasterWhite,
	stillCream,
	signalBlue,
	clearingWhite,
	marmaladeWhite,
];

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

/** The night salon (from Mosley): a one-pager home — giant serif name over a
 * bleeding hero cluster, an eyebrow-and-statement bio device, a captioned
 * scatter, a display-type services accordion, a giant BOOK/A WALL call to
 * action, and a booking form — with Bio, Portfolio, and Awards rooms behind
 * it. Every catalog Bellows hangs somewhere; four repeat across rooms. */
const conservatoryRecipe: StarterRecipe = {
	id: 'conservatory',
	name: 'Conservatory',
	discipline: 'Painting',
	disciplines: ['painting', 'drawing'],
	tagline: 'A night salon — bold work scattered under a giant serif name.',
	description: 'Fifteen George Bellows paintings on deep green: a seven-part night salon with bio, portfolio, and awards rooms.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['conservatory-green'],
	defaultThemeId: 'conservatory-green',
	readiness: 'ready',
	gallerySpecs: [
		spec('conservatory-hero', 'hero', 'Hero wall', 'selected-work', [
			'painting-nga-46557-v1',
			'painting-nga-46558-v1',
			'painting-nga-61351-v1',
			'painting-nga-61355-v1',
			'painting-nga-46559-v1',
		]),
		spec('conservatory-statement', 'statement', 'Bio statement', 'series', [
			'painting-nga-61354-v1',
		]),
		spec('conservatory-scatter', 'scatter', 'Series scatter', 'series', [
			'painting-nga-30667-v1',
			'painting-nga-61247-v1',
			'painting-nga-134485-v1',
			'painting-nga-69392-v1',
		]),
		spec('conservatory-bio', 'bio', 'Bio wall', 'series', [
			'painting-nga-61353-v1',
			'painting-nga-61352-v1',
			'painting-nga-30742-v1',
		]),
		spec('conservatory-portfolio', 'portfolio', 'Portfolio scatter', 'series', [
			'painting-nga-30743-v1',
			'painting-nga-57491-v1',
			'painting-nga-61355-v1',
			'painting-nga-61247-v1',
			'painting-nga-46559-v1',
		]),
		spec('conservatory-awards', 'awards', 'Awards wall', 'series', [
			'painting-nga-69392-v1',
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
	description: 'Twelve vintage street photographs — Lewis Hine and Eugène Atget in a four-column contact grid on white, signed off in display type.',
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
			'photography-nga-197731-v1',
			'photography-nga-170445-v1',
			'photography-nga-124974-v1',
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

// ---------------------------------------------------------------------------
// Spec-14 batch 2: five starters translated from the SOURCES.md keepers
// (Bergen, Cimen, Aue Sobol, Arthur, Quinn). Sculpture and photography reuse
// existing catalog imagery; the rest draws on unused NGA entries.

const promenadeContent: Content = starterContent(promenadeContentRaw);

/** The painted halls (from Bergen): a centered didone mission, then three
 * full-width watercolor bands, each answered by a hall title and a small
 * study hung on the right edge. */
const promenadeRecipe: StarterRecipe = {
	id: 'promenade',
	name: 'Promenade',
	discipline: 'Painting',
	disciplines: ['painting', 'photography'],
	tagline: 'A mission statement and three full-width painted halls.',
	description: 'Nine Emily Sargent watercolors: three edge-to-edge halls with studies, plus a sketchbook page.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['plaster-white'],
	defaultThemeId: 'plaster-white',
	readiness: 'ready',
	gallerySpecs: [
		spec('promenade-hall-1', 'hall-1', 'Hall 1 — band', 'selected-work', ['painting-nga-222879-v1']),
		spec('promenade-hall-1-side', 'hall-1-side', 'Hall 1 — study', 'selected-work', ['painting-nga-222877-v1']),
		spec('promenade-hall-2', 'hall-2', 'Hall 2 — band', 'selected-work', ['painting-nga-222884-v1']),
		spec('promenade-hall-2-side', 'hall-2-side', 'Hall 2 — study', 'selected-work', ['painting-nga-222880-v1']),
		spec('promenade-hall-3', 'hall-3', 'Hall 3 — band', 'selected-work', ['painting-nga-222875-v1']),
		spec('promenade-hall-3-side', 'hall-3-side', 'Hall 3 — study', 'selected-work', ['painting-nga-222874-v1']),
		spec('promenade-sketchbook', 'sketchbook', 'Sketchbook', 'series', [
			'painting-nga-222876-v1',
			'painting-nga-222873-v1',
			'painting-nga-222881-v1',
		]),
	],
	content: promenadeContent,
	coverSampleAssetId: 'painting-nga-222879-v1',
};

const stillRoomContent: Content = starterContent(stillRoomContentRaw);

/** The still room (from Cimen): a cream editorial of paired object studies —
 * statement over the first pair, Work and Commissions pairs with a right
 * bleed, and a marquee + giant serif signature to close. */
const stillRoomRecipe: StarterRecipe = {
	id: 'still-room',
	name: 'Still Room',
	discipline: 'Sculpture',
	disciplines: ['sculpture', 'photography'],
	tagline: 'Quiet cream rooms of paired object studies.',
	description: 'Eight Open Access sculpture studies in paired tiles on warm cream, signed off in display serif.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['still-cream', 'vitrine'],
	defaultThemeId: 'still-cream',
	readiness: 'ready',
	gallerySpecs: [
		spec('still-room-statement', 'statement', 'Statement', 'selected-work', [
			'sculptor-met-544227-v1',
			'sculptor-met-254587-v1',
		]),
		spec('still-room-work-pair', 'work-pair', 'Work', 'selected-work', [
			'sculptor-met-255417-v1',
			'sculptor-met-248268-v1',
		]),
		spec('still-room-commissions-pair', 'commissions-pair', 'Commissions', 'selected-work', [
			'sculptor-met-248579-v1',
			'sculptor-met-255275-v1',
		]),
		spec('still-room-colophon', 'colophon', 'Signature', 'selected-work', ['sculptor-met-257603-v1']),
		spec('still-room-collection', 'collection', 'Collection', 'series', [
			'sculptor-met-257603-v1',
			'sculptor-met-251838-v1',
			'sculptor-met-544227-v1',
			'sculptor-met-255417-v1',
		]),
	],
	content: stillRoomContent,
	coverSampleAssetId: 'sculptor-met-544227-v1',
};

const signalContent: Content = starterContent(signalContentRaw);

/** The signal (from Aue Sobol): heavy ink-blue type on white — offset photo
 * clusters crossed by giant linked headlines, closed by a giant name. */
const signalRecipe: StarterRecipe = {
	id: 'signal',
	name: 'Signal',
	discipline: 'Photography',
	disciplines: ['photography', 'illustration-design'],
	tagline: 'Heavy blue headlines laid across offset photo clusters.',
	description: 'Twelve Carleton Watkins landscapes under giant ink-blue display links and a closing wordmark.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['signal-blue'],
	defaultThemeId: 'signal-blue',
	readiness: 'ready',
	gallerySpecs: [
		spec('signal-cluster-1', 'cluster-1', 'First cluster', 'selected-work', [
			'photographer-met-285861-v1',
			'photographer-met-286426-v1',
			'photographer-met-286457-v1',
		]),
		spec('signal-cluster-2', 'cluster-2', 'Second cluster', 'selected-work', [
			'photographer-met-285860-v1',
			'photographer-met-286425-v1',
			'photographer-met-262612-v1',
		]),
		spec('signal-colophon', 'signal-colophon', 'Signature', 'selected-work', ['photographer-met-286511-v1']),
		spec('signal-works', 'works', 'Works', 'series', [
			'photographer-met-283222-v1',
			'photographer-met-285772-v1',
			'photographer-met-286049-v1',
			'photographer-met-285861-v1',
			'photographer-met-286425-v1',
			'photographer-met-262612-v1',
		]),
	],
	content: signalContent,
	coverSampleAssetId: 'photographer-met-285861-v1',
};

const clearingContent: Content = starterContent(clearingContentRaw);

/** The clearing (from Arthur): six photographs scattered across two and a
 * half screens of white with one crossing the right edge — and not a word of
 * copy on the canvas. */
const clearingRecipe: StarterRecipe = {
	id: 'clearing',
	name: 'Clearing',
	discipline: 'Photography',
	disciplines: ['photography', 'drawing'],
	tagline: 'Six photographs and a great deal of air.',
	description: 'Ten Eugène Atget photographs: a sparse asymmetric scatter, an index page, and nothing extra.',
	requiredTraits: ['full-bleed-media', 'freeform-canvas'],
	compatibleThemeIds: ['clearing-white', 'gallery-linen'],
	defaultThemeId: 'clearing-white',
	readiness: 'ready',
	gallerySpecs: [
		spec('clearing-scatter', 'clearing', 'Clearing', 'selected-work', [
			'photography-nga-124992-v1',
			'photography-nga-124987-v1',
			'photography-nga-136283-v1',
			'photography-nga-124982-v1',
			'photography-nga-115379-v1',
			'photography-nga-124996-v1',
		]),
		spec('clearing-index', 'index', 'Index', 'series', [
			'photography-nga-136284-v1',
			'photography-nga-124989-v1',
			'photography-nga-131732-v1',
			'photography-nga-124995-v1',
		]),
	],
	content: clearingContent,
	coverSampleAssetId: 'photography-nga-124992-v1',
};

const marmaladeContent: Content = starterContent(marmaladeContentRaw);

/** The marmalade poster (from Quinn): PORTFOLIO twice in giant condensed
 * serif with the hero drawing sandwiched between, on an orange-red block —
 * the source's orange type inverted into a ground — then a gray select-works
 * block and an exhibitions list. */
const marmaladeRecipe: StarterRecipe = {
	id: 'marmalade',
	name: 'Marmalade',
	discipline: 'Drawing',
	disciplines: ['drawing', 'illustration-design'],
	tagline: 'One loud word, twice, with the work between.',
	description: 'Thirteen John Singer Sargent drawings behind a doubled display wordmark on orange and gray blocks.',
	requiredTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas', 'longform-case-study'],
	compatibleThemeIds: ['marmalade-white'],
	defaultThemeId: 'marmalade-white',
	readiness: 'ready',
	gallerySpecs: [
		spec('marmalade-poster', 'poster', 'Poster', 'selected-work', ['drawing-nga-184301-v1']),
		spec('marmalade-select', 'select', 'Select works', 'selected-work', [
			'drawing-nga-184331-v1',
			'drawing-nga-62960-v1',
			'drawing-nga-184264-v1',
			'drawing-nga-197320-v1',
			'drawing-nga-184996-v1',
			'drawing-nga-185018-v1',
		]),
		spec('marmalade-select-works', 'select-works', 'Select works page', 'series', [
			'drawing-nga-184265-v1',
			'drawing-nga-194571-v1',
			'drawing-nga-184330-v1',
			'drawing-nga-184277-v1',
			'drawing-nga-184315-v1',
			'drawing-nga-184995-v1',
		]),
	],
	content: marmaladeContent,
	coverSampleAssetId: 'drawing-nga-184301-v1',
};

export const STARTER_RECIPES: StarterRecipe[] = [
	conservatoryRecipe,
	mastheadRecipe,
	atelierRecipe,
	contactSheetRecipe,
	runwayRecipe,
	promenadeRecipe,
	stillRoomRecipe,
	signalRecipe,
	clearingRecipe,
	marmaladeRecipe,
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

/** The template's own rendered page, as the picker and the product site show it.
 * Generated — never hand-made — by `node scripts/capture-template-shots.mjs`,
 * which renders each starter at a fixed viewport and writes the card-sized webp
 * into public/assets/starters/shots/. A new template gets its shot from the
 * same command. */
export function starterShotUrl(id: string | null | undefined): string | undefined {
	if (!id || !STARTER_RECIPES.some((recipe) => recipe.id === id)) return undefined;
	return withBase(import.meta.env.BASE_URL, `assets/starters/shots/${id}.webp`);
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
 * scheme: a preset that declares it wins, otherwise the site keeps its own.
 * Bundled starter faces the incoming theme declares come along (a template's
 * typography is part of its design); on a name collision the document's own
 * font keeps the name. */
export function contentWithThemePreset(content: Content, theme: Theme): Content {
	const own = content.theme.customFonts ?? [];
	const ownNames = new Set(own.map((font) => font.name));
	const bundled = (theme.customFonts ?? []).filter(
		(font) => !ownNames.has(font.name) && !!starterFontForCustomFont(font),
	);
	const customFonts = [...own, ...bundled];
	return {
		...content,
		theme: {
			...JSON.parse(JSON.stringify(theme)),
			customFonts: customFonts.length ? JSON.parse(JSON.stringify(customFonts)) : undefined,
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
	for (const font of content.theme.customFonts ?? []) {
		const face = starterFontForCustomFont(font);
		if (!face)
			issues.push(`${recipe.name} font “${font.name}” is not a bundled starter face the template can ship.`);
		else if (font.weight !== face.weight)
			issues.push(`${recipe.name} font “${font.name}” must declare the catalog weight “${face.weight}”.`);
	}
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
	// The bundled font catalog is part of the rights contract: one file per
	// family, OFL license evidence on every face, and presets never declare
	// faces themselves (starters do — presets are color/typography tokens).
	const fontFamilies = new Set<string>();
	const fontFiles = new Set<string>();
	for (const face of STARTER_FONT_FACES) {
		if (fontFamilies.has(face.family)) issues.push(`Duplicate starter font family: ${face.family}`);
		fontFamilies.add(face.family);
		if (fontFiles.has(face.file)) issues.push(`Duplicate starter font file: ${face.file}`);
		fontFiles.add(face.file);
		if (!/^fonts\/[a-z0-9-]+\.woff2$/.test(face.file))
			issues.push(`${face.family} font file must live under fonts/ as a woff2.`);
		if (!/^\d{1,4}( \d{1,4})?$/.test(face.weight))
			issues.push(`${face.family} has an invalid font-weight descriptor.`);
		if (face.license !== 'OFL-1.1' || !face.copyright || !face.source)
			issues.push(`${face.family} is missing font license evidence.`);
	}
	for (const theme of themes)
		if (theme.tokens.customFonts?.length)
			issues.push(`${theme.name} may not declare font files — bundled faces are starter-declared.`);
	const recipeIds = new Set<string>();
	const sampleIds = new Set<string>();
	for (const artwork of artworkCatalog.values()) {
		if (sampleIds.has(artwork.id)) issues.push(`Duplicate sample artwork id: ${artwork.id}`);
		sampleIds.add(artwork.id);
		if (artwork.width <= 0 || artwork.height <= 0 || artwork.aspectRatio <= 0)
			issues.push(`${artwork.id} is missing valid dimensions.`);
		// Artist-provided works carry a rights note but no museum provenance
		// (no accession number or external object page).
		const needsProvenance = artwork.source !== 'Artist provided';
		if (!artwork.rightsProof || (needsProvenance && (!artwork.objectUrl || !artwork.accessionNumber)))
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
