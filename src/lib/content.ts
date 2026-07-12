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
	/** Meta description used for SEO and social cards. */
	description: string;
	/** Favicon file name, served from public/. */
	favicon: string;
}

export interface Theme {
	backgroundColor: string;
	textColor: string;
	mutedTextColor: string;
	accentColor: string;
	fontFamily: string;
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

export interface GalleryConfig {
	/** Folder name under src/assets/ that holds this gallery's images. */
	folder: string;
	/** Alt text applied to every image in the gallery. */
	alt: string;
	/** 'asc' keeps file-name order; 'desc' reverses it (newest-named first). */
	order: 'asc' | 'desc';
}

export interface PageConfig {
	/** Browser-tab title. "{name}" is replaced with site.name by pageTitle(). */
	title: string;
	/** Optional on-page heading (Home only, today). */
	heading?: string;
	/** Present on gallery pages; absent on text-only pages like About. */
	gallery?: GalleryConfig;
}

export interface ImageMeta {
	title?: string;
	description?: string;
	link?: string;
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

export const content = data as Content;

/** Resolve a title template, replacing "{name}" with the site name. */
export const pageTitle = (template: string): string =>
	template.replace('{name}', content.site.name);
