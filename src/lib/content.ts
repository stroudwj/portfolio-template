// Typed access to the site's single content source, src/data/content.json.
//
// Every component and page imports from here (or from ./galleries.ts) instead of
// hardcoding text. To change what the site says, edit content.json — never these
// components. The shapes below describe that file so editors get autocomplete and
// the build fails loudly if the data drifts from what the pages expect.
import data from '../data/content.json';

export interface Site {
	/** Owner name — the single source of truth, reused in the logo and every page title. */
	name: string;
	/** Optional logo override; falls back to `name` when omitted or empty. */
	logo?: string;
	/** Optional logo image (path under src/assets/); shown in the header instead of the text logo. */
	logoImage?: string;
	/** Meta description used for SEO and social cards. */
	description: string;
	/** Favicon file name, served from public/. */
	favicon: string;
}

/** A user-uploaded font: `file` is a path under src/assets/ (e.g. "fonts/my-font.woff2"). */
export interface CustomFont {
	name: string;
	file: string;
}

export interface Theme {
	backgroundColor: string;
	textColor: string;
	mutedTextColor: string;
	accentColor: string;
	fontFamily: string;
	/** Font for headings (page titles + the text logo). Absent = same as fontFamily. */
	headingFontFamily?: string;
	/** Extra space (px) between the site header and the page content. Absent = 0. */
	contentGap?: number;
	/** Fonts uploaded in the editor, available alongside the factory list. */
	customFonts?: CustomFont[];
}

export interface NavItem {
	/** Page file name in src/pages/ without extension ('' for the Home page). */
	path: string;
	label: string;
}

export interface Profile {
	/** Image file living in src/assets/ (resolved via ./galleries.ts). */
	image: string;
	/** About-page body. "\n" is a line break; "\n\n" is a blank line. */
	bio: string;
}

export interface Contact {
	email: string;
}

export interface SocialLink {
	label: string;
	url: string;
}

export interface Resume {
	label: string;
	/** Path to a file in public/ (base path is joined at render time). */
	url: string;
}

export type GalleryLayoutMode = 'freeform' | 'grid';

export interface GalleryConfig {
	/** Folder name under src/assets/ that holds this gallery's images. */
	folder: string;
	/** Alt text applied to every image in the gallery. */
	alt: string;
	/** 'asc' keeps file-name order; 'desc' reverses it (newest-named first). */
	order: 'asc' | 'desc';
	/** 'grid' auto-arranges images in uniform rows; absent/'freeform' is the drag-anywhere canvas. */
	layout?: GalleryLayoutMode;
	/** Grid mode: images per row (1–6, default 3). */
	columns?: number;
	/** Grid mode: crop ratio like "1:1" or "4:3"; absent = original ratios (no crop). */
	aspect?: string;
}

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Freeform placement of a text block on the page canvas. Same coordinate
 * system as ImageLayout: x, y and w are percentages of the canvas WIDTH.
 * `h` is the text's rendered height (also in canvas-width %), measured in the
 * editor so the canvas can reserve room for it; text height doesn't scale
 * perfectly with viewport width, so it is an estimate, not a crop box.
 */
export interface TextLayout {
	x: number;
	y: number;
	w: number;
	h?: number;
}

/**
 * One ordered piece of a page's body. 'text' is free text placeable anywhere;
 * 'embed' is a YouTube/Vimeo video (its optional `layout` pins the player onto
 * the page's freeform canvas, like images); 'gallery' renders the page's
 * gallery; 'images' is an extra self-contained image group (its own folder +
 * layout settings), so one page can hold several canvases/grids; 'children'
 * renders the page's sub-pages as thumbnail cards; 'about' renders the profile
 * section (bio, email, social links).
 */
export type PageBlock =
	| { id: string; type: 'text'; text: string; align?: TextAlign; layout?: TextLayout }
	| { id: string; type: 'embed'; url: string; layout?: ImageLayout }
	| { id: string; type: 'gallery' }
	| { id: string; type: 'images'; gallery: GalleryConfig }
	| { id: string; type: 'children' }
	| { id: string; type: 'about' };

export interface PageConfig {
	/** Browser-tab title. "{name}" is replaced with site.name by pageTitle(). */
	title: string;
	/** Display name — nav entry for top-level pages, card caption for sub-pages. */
	label?: string;
	/** Optional on-page heading shown above the body. */
	heading?: string;
	/** Present on gallery pages; absent on text-only pages like About. */
	gallery?: GalleryConfig;
	/** Ordered body blocks. Filled in by migrateContent() for pre-block content. */
	blocks?: PageBlock[];
	/** Ordered sub-page keys, shown as thumbnail cards via the 'children' block. */
	children?: string[];
	/** Card image for this page when it appears as a sub-page (path under src/assets/). */
	thumbnail?: string;
}

/**
 * Freeform placement of one image on the page canvas. Every unit — x, y and w —
 * is a percentage of the canvas WIDTH (y included), so a layout scales
 * proportionally at any viewport size. `ar` is the image's width/height ratio
 * and fixes its rendered height.
 */
export interface ImageLayout {
	x: number;
	y: number;
	w: number;
	ar: number;
}

export interface ImageMeta {
	title?: string;
	description?: string;
	link?: string;
	/** Legacy grid width in columns (1–4); ignored once `layout` exists. */
	w?: number;
	/** Legacy grid height in row units (1–4); ignored once `layout` exists. */
	h?: number;
	/** Freeform canvas placement. Absent = auto-flowed until first arranged. */
	layout?: ImageLayout;
}

export interface GalleryData {
	/** Maps an image file name to its optional caption metadata. */
	items: Record<string, ImageMeta>;
}

export interface Content {
	site: Site;
	theme: Theme;
	nav: NavItem[];
	profile: Profile;
	contact: Contact;
	social: SocialLink[];
	resume: Resume;
	pages: Record<string, PageConfig>;
	galleries: Record<string, GalleryData>;
}

/** Every gallery config a page renders: its main gallery plus any extra image groups. */
export function pageGalleryConfigs(page: PageConfig): GalleryConfig[] {
	const configs: GalleryConfig[] = page.gallery ? [page.gallery] : [];
	for (const block of page.blocks ?? []) {
		if (block.type === 'images') configs.push(block.gallery);
	}
	return configs;
}

/**
 * Upgrade pre-block content in place: every page gets `blocks` (its gallery, or the
 * About section for the galleryless 'bio' page) and a `label` (from its nav entry).
 * Idempotent, so already-migrated content passes through untouched. Shared by the
 * site build, the editor, and the published-site loader — one upgrade path.
 */
export function migrateContent(c: Content): Content {
	const labelByPath = new Map(c.nav.map((item) => [item.path || 'home', item.label]));
	for (const [key, page] of Object.entries(c.pages)) {
		if (!page.blocks) {
			if (page.gallery) page.blocks = [{ id: 'gallery', type: 'gallery' }];
			else if (key === 'bio') page.blocks = [{ id: 'about', type: 'about' }];
			else page.blocks = [];
		}
		if (page.children?.length && !page.blocks.some((b) => b.type === 'children'))
			page.blocks.push({ id: 'children', type: 'children' });
		if (!page.label) page.label = labelByPath.get(key) ?? key;
	}
	return c;
}

export const content = migrateContent(data as Content);

/** Resolve a title template, replacing "{name}" with the site name. */
export const pageTitle = (template: string): string =>
	template.replace('{name}', content.site.name);
