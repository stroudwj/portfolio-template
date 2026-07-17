// The starting-point site templates offered on the Start screen. Each one is a
// complete, valid Content document — same schema the editor and site share — so
// picking one just seeds the editor via initDocFromContent(). "Classic" is the
// bundled default the product always had; the two below give a different whole
// site out of the box: theme, type, nav structure, page setup and gallery modes.
import type { Content } from '../../lib/content';

export interface SiteTemplate {
	id: string;
	name: string;
	tagline: string;
	content: Content;
}

/** Bold dark-room look: near-black canvas, warm accent, geometric sans, and a
 *  tight square work grid next to the freeform home collage. */
const studioContent: Content = {
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg' },
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
	site: { name: '', description: 'Portfolio', favicon: 'favicon.svg' },
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
];
