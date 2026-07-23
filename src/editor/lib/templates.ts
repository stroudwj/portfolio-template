// The starting-point site templates offered on the Start screen. Each one is a
// complete, valid Content document — same schema the editor and site share — so
// picking one just seeds the editor via initDocFromContent(). "Classic" is the
// bundled default the product always had; the two below give a different whole
// site out of the box: theme, type, nav structure, page setup and gallery modes.
import { DEFAULT_FOOTER, type Content } from '../../lib/content';

export interface SiteTemplate {
	id: string;
	name: string;
	tagline: string;
	content: Content;
}

/** Bold dark-room look: near-black canvas, warm accent, geometric sans, and a
 *  tight square work grid next to the freeform home collage. */
const studioContent: Content = {
	schemaVersion: 3,
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
	theme: {
		backgroundColor: '#101014',
		textColor: '#f4f4f5',
		mutedTextColor: '#9a9aa3',
		accentColor: '#ffb454',
		fontFamily: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif',
		contentGap: 40,
	},
	nav: [
		{ path: '', label: 'Home' },
		{ path: 'work', label: 'Work' },
		{ path: 'bio', label: 'About' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Selected Work',
			heading: 'Selected Work',
			gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		work: {
			title: 'Work — {name}',
			heading: 'Work',
			gallery: { folder: 'work', alt: 'Work', order: 'asc', layout: 'grid', columns: 3, aspect: '1:1' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		bio: {
			title: 'About — {name}',
			blocks: [{ id: 'about', type: 'about' }],
		},
	},
	galleries: { 'selected-works': { items: {} }, work: { items: {} } },
};

/** Quiet magazine look: warm paper background, serif type, big two-column
 *  project spreads plus a freeform gallery for looser work. */
const editorialContent: Content = {
	schemaVersion: 3,
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
	theme: {
		backgroundColor: '#faf6f0',
		textColor: '#221f1a',
		mutedTextColor: '#847b6f',
		accentColor: '#9a3412',
		fontFamily: 'Georgia, "Times New Roman", serif',
		contentGap: 24,
	},
	nav: [
		{ path: '', label: 'Home' },
		{ path: 'projects', label: 'Projects' },
		{ path: 'bio', label: 'About' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Portfolio',
			heading: 'Portfolio',
			gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc', layout: 'grid', columns: 2 },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		projects: {
			title: 'Projects — {name}',
			heading: 'Projects',
			gallery: { folder: 'projects', alt: 'Project', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		bio: {
			title: 'About — {name}',
			blocks: [{ id: 'about', type: 'about' }],
		},
	},
	galleries: { 'selected-works': { items: {} }, projects: { items: {} } },
};

/** Brutalist index: pure white, typewriter mono, a dense numbered-archive feel —
 *  a loose 4-across index up front and a tight 6-across square archive behind it. */
const archiveContent: Content = {
	schemaVersion: 3,
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
	theme: {
		backgroundColor: '#ffffff',
		textColor: '#111111',
		mutedTextColor: '#6f6f6f',
		accentColor: '#d92b2b',
		fontFamily: '"Courier New", Courier, monospace',
		contentGap: 24,
	},
	nav: [
		{ path: '', label: 'Index' },
		{ path: 'archive', label: 'Archive' },
		{ path: 'bio', label: 'Info' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Index',
			heading: 'Index',
			gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc', layout: 'grid', columns: 4 },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		archive: {
			title: 'Archive — {name}',
			heading: 'Archive',
			gallery: { folder: 'archive', alt: 'Archive piece', order: 'asc', layout: 'grid', columns: 6, aspect: '1:1' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		bio: {
			title: 'Info — {name}',
			blocks: [{ id: 'about', type: 'about' }],
		},
	},
	galleries: { 'selected-works': { items: {} }, archive: { items: {} } },
};

/** Calm art-gallery look: sage paper, deep green accent, serif headings over a
 *  sans body, a freeform home collage, and a Collections page built from TWO
 *  labeled image groups — showing off multiple galleries on one page. */
const atelierContent: Content = {
	schemaVersion: 3,
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg', footer: DEFAULT_FOOTER },
	theme: {
		backgroundColor: '#eef0e9',
		textColor: '#1e2620',
		mutedTextColor: '#6d7a6e',
		accentColor: '#3f6d4e',
		fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
		headingFontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
		contentGap: 32,
	},
	nav: [
		{ path: '', label: 'Home' },
		{ path: 'collections', label: 'Collections' },
		{ path: 'bio', label: 'About' },
	],
	profile: { image: '', bio: '' },
	contact: { email: '' },
	social: [],
	resume: { label: 'Résumé', url: '' },
	pages: {
		home: {
			title: '{name} — Portfolio',
			gallery: { folder: 'selected-works', alt: 'Selected work', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		},
		collections: {
			title: 'Collections — {name}',
			heading: 'Collections',
			gallery: { folder: 'collection-one', alt: 'Collection I', order: 'asc', layout: 'grid', columns: 3 },
			blocks: [
				{ id: 'c1-title', type: 'text', text: 'Collection I' },
				{ id: 'gallery', type: 'gallery' },
				{ id: 'c2-title', type: 'text', text: 'Collection II' },
				{
					id: 'c2-set',
					type: 'images',
					gallery: { folder: 'collection-two', alt: 'Collection II', order: 'asc', layout: 'grid', columns: 3 },
				},
			],
		},
		bio: {
			title: 'About — {name}',
			blocks: [{ id: 'about', type: 'about' }],
		},
	},
	galleries: { 'selected-works': { items: {} }, 'collection-one': { items: {} }, 'collection-two': { items: {} } },
};

export const SITE_TEMPLATES: SiteTemplate[] = [
	{
		id: 'studio',
		name: 'Studio',
		tagline: 'Dark, bold & geometric — a square work grid on near-black.',
		content: studioContent,
	},
	{
		id: 'editorial',
		name: 'Editorial',
		tagline: 'Warm paper & serif type — big two-column project spreads.',
		content: editorialContent,
	},
	{
		id: 'archive',
		name: 'Archive',
		tagline: 'Stark white & typewriter mono — a dense numbered-index feel.',
		content: archiveContent,
	},
	{
		id: 'atelier',
		name: 'Atelier',
		tagline: 'Sage paper, serif headings & two labeled collections per page.',
		content: atelierContent,
	},
];
