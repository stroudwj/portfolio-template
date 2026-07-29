import { DEFAULT_FOOTER, pageGalleryConfigs, type Content, type PageConfig, type Theme } from '../../lib/content';
import type { EditorDoc } from './types';
import { SAMPLE_ARTWORK, aspectDifference, getSampleArtwork, type SampleArtwork } from './sample-artwork';

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
	id: 'painter' | 'photographer' | 'illustrator-designer';
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
	tokens: {
		backgroundColor: '#f3efe7',
		textColor: '#201f1c',
		mutedTextColor: '#746f65',
		accentColor: '#48614f',
		fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
		headingFontFamily: 'Garamond, "Apple Garamond", "EB Garamond", Georgia, serif',
		contentGap: 20,
		pageHeadingPosition: 'left',
		navStyle: 'minimal',
		automaticTextContrast: true,
		stabilizeNavigation: true,
	},
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
};

const nightGallery: ThemePreset = {
	id: 'night-gallery',
	name: 'Night Gallery',
	description: 'Near-black walls, warm type, and copper accents for image-led work.',
	tokens: {
		backgroundColor: '#141413',
		textColor: '#f1eee7',
		mutedTextColor: '#aaa59b',
		accentColor: '#cc8f57',
		fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
		headingFontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
		contentGap: 20,
		pageHeadingPosition: 'left',
		navStyle: 'minimal',
		automaticTextContrast: true,
		stabilizeNavigation: true,
	},
	supportedTraits: ['full-bleed-media', 'dense-grid', 'freeform-canvas'],
};

const caseStudyPaper: ThemePreset = {
	id: 'case-study-paper',
	name: 'Case Study Paper',
	description: 'A structured reading theme for long-form projects and process notes.',
	tokens: {
		backgroundColor: '#fbfaf7',
		textColor: '#171717',
		mutedTextColor: '#6d6a64',
		accentColor: '#264c8b',
		fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
		headingFontFamily: 'Georgia, "Times New Roman", serif',
		contentGap: 32,
		pageHeadingPosition: 'left',
		navStyle: 'topbar',
		automaticTextContrast: true,
		stabilizeNavigation: true,
	},
	supportedTraits: ['full-bleed-media', 'longform-case-study'],
};

const graphicIndex: ThemePreset = {
	id: 'graphic-index',
	name: 'Graphic Index',
	description: 'Compact typography and a crisp grid for visual systems and case studies.',
	tokens: {
		backgroundColor: '#f7f7f2',
		textColor: '#101010',
		mutedTextColor: '#66645f',
		accentColor: '#d93421',
		fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
		headingFontFamily: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif',
		contentGap: 24,
		pageHeadingPosition: 'left',
		navStyle: 'topbar',
		automaticTextContrast: true,
		stabilizeNavigation: true,
	},
	supportedTraits: ['dense-grid', 'longform-case-study'],
};

export const THEME_PRESETS: ThemePreset[] = [galleryLinen, nightGallery, caseStudyPaper, graphicIndex];

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

function galleryItems(
	ids: readonly string[],
	layouts?: Array<{ x: number; y: number; w: number }>,
): Content['galleries'][string] {
	return {
		items: Object.fromEntries(
			ids.map((id, index) => {
				const artwork = artworkOrThrow(id);
				const filename = artwork.url.split('/').pop() ?? `${id}.jpg`;
				return [
					filename,
					{
						id: `sample-${id}`,
						sampleAssetId: id,
						title: artwork.title,
						alt: artwork.alt,
						description: artwork.credit,
						link: artwork.objectUrl,
						layout: layouts?.[index]
							? { ...layouts[index], ar: artwork.aspectRatio }
							: undefined,
					},
				];
			}),
		),
	};
}

const painterPages: Record<string, PageConfig> = {
	home: {
		title: '{name} — Selected Work',
		heading: 'Selected Work',
		gallery: { folder: 'selected-work', alt: 'Selected paintings', order: 'asc', layout: 'freeform' },
		blocks: [{ id: 'gallery', type: 'gallery' }],
	},
	collection: {
		title: 'Collection — {name}',
		heading: 'Collection',
		gallery: { folder: 'collection', alt: 'Painting collection', order: 'asc', layout: 'grid', columns: 3 },
		blocks: [
			{
				id: 'collection-intro',
				type: 'text',
				style: 'subheading',
				text: 'A focused group of recent paintings. Replace every sample with your own work before publishing.',
			},
			{ id: 'gallery', type: 'gallery' },
		],
	},
	about: {
		title: 'About — {name}',
		heading: 'About',
		blocks: [{ id: 'about', type: 'about' }],
	},
};

const painterContent: Content = {
	schemaVersion: 4,
	site: {
		name: 'Your Name',
		headerMode: 'name',
		description: 'Painter portfolio',
		favicon: 'favicon.svg',
		footer: DEFAULT_FOOTER,
	},
	theme: galleryLinen.tokens,
	nav: [
		{ path: '', label: 'Selected Work' },
		{ path: 'collection', label: 'Collection' },
		{ path: 'about', label: 'About' },
	],
	profile: {
		image: 'assets/starters/painter/11-claude-monet-self-portrait.jpg',
		bio: 'Write a short introduction to your practice, materials, and current interests. The paintings in this starter are museum-owned Open Access samples and cannot be published as your work.',
	},
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: painterPages,
	galleries: {
		'selected-work': galleryItems(painterSelectedIds, [
			{ x: 4, y: 4, w: 25 },
			{ x: 34, y: 4, w: 38 },
			{ x: 78, y: 4, w: 18 },
			{ x: 4, y: 44, w: 44 },
			{ x: 58, y: 44, w: 22 },
		]),
		collection: galleryItems(painterCollectionIds),
	},
};

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

const photographerPages: Record<string, PageConfig> = {
	home: {
		title: '{name} — Yosemite Valley',
		heading: 'Yosemite Valley',
		description: 'Four landscape studies from Carleton Watkins’s Yosemite photographs.',
		gallery: {
			folder: 'yosemite-valley',
			alt: 'Yosemite Valley photographs',
			order: 'asc',
			layout: 'freeform',
		},
		blocks: [
			{
				id: 'valley-intro',
				type: 'text',
				style: 'subheading',
				text: 'A four-image series. Replace every public-domain sample with your own photographs before publishing.',
			},
			{ id: 'gallery', type: 'gallery' },
		],
	},
	'falls-stone': {
		title: 'Falls & Stone — {name}',
		heading: 'Falls & Stone',
		description: 'Water, granite, and forest in four historical landscape photographs.',
		gallery: {
			folder: 'falls-stone',
			alt: 'Waterfalls and granite photographs',
			order: 'asc',
			layout: 'grid',
			columns: 3,
		},
		blocks: [
			{
				id: 'falls-intro',
				type: 'text',
				style: 'subheading',
				text: 'Use this page for a tightly edited series, assignment, or location study.',
			},
			{ id: 'gallery', type: 'gallery' },
		],
	},
	'western-horizons': {
		title: 'Western Horizons — {name}',
		heading: 'Western Horizons',
		description: 'Four views of the nineteenth-century American West.',
		gallery: {
			folder: 'western-horizons',
			alt: 'Western landscape photographs',
			order: 'asc',
			layout: 'grid',
			columns: 2,
		},
		blocks: [
			{
				id: 'horizons-intro',
				type: 'text',
				style: 'subheading',
				text: 'A second visual rhythm for a distinct body of work, with covers derived from the series itself.',
			},
			{ id: 'gallery', type: 'gallery' },
		],
	},
	about: {
		title: 'About — {name}',
		heading: 'About',
		blocks: [{ id: 'about', type: 'about' }],
	},
};

const photographerContent: Content = {
	schemaVersion: 4,
	site: {
		name: 'Your Name',
		headerMode: 'name',
		description: 'Photographer portfolio',
		favicon: 'favicon.svg',
		footer: DEFAULT_FOOTER,
	},
	theme: nightGallery.tokens,
	nav: [
		{ path: '', label: 'Yosemite Valley' },
		{ path: 'falls-stone', label: 'Falls & Stone' },
		{ path: 'western-horizons', label: 'Western Horizons' },
		{ path: 'about', label: 'About' },
	],
	profile: {
		image: '',
		bio: 'Write a short introduction to your photographic practice, subjects, and commissions. The photographs in this starter are public-domain museum samples and cannot be published as your work.',
	},
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: photographerPages,
	galleries: {
		'yosemite-valley': galleryItems(photographerValleyIds, [
			{ x: 4, y: 4, w: 43 },
			{ x: 53, y: 4, w: 43 },
			{ x: 4, y: 44, w: 43 },
			{ x: 53, y: 44, w: 43 },
		]),
		'falls-stone': galleryItems(photographerFallsIds),
		'western-horizons': galleryItems(photographerHorizonsIds),
	},
};

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

export const STARTER_RECIPES: StarterRecipe[] = [painterRecipe, photographerRecipe, illustratorRecipe];

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
	}
	return issues;
}
