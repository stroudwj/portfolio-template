// Shared prop types for the portfolio component system.
//
// These components are rendered in TWO places from the SAME source: the Astro
// site (static HTML at build) and the React editor preview (live). To stay
// framework-neutral they never touch Astro's image pipeline — callers resolve
// images to plain `src` strings first (Astro via getImage(), the editor via
// object URLs) and pass them in as `ResolvedImage`.
import type { Content, NavItem, SocialLink } from '../lib/content';

export type { Content, NavItem, SocialLink };

/** An image ready to render: a resolved URL plus its optional caption metadata. */
export interface ResolvedImage {
	/** Stable key for React lists (optional). */
	id?: string;
	src: string;
	srcSet?: string;
	alt: string;
	title?: string;
	description?: string;
	link?: string;
	/** Grid width in columns (1–4, default 1). */
	w?: number;
	/** Grid height in row units (1–4, default 1). */
	h?: number;
}

/** Everything the portfolio needs to render, with images already resolved. */
export interface PortfolioData {
	content: Content;
	/** Folder name -> ordered, resolved images. */
	galleries: Record<string, ResolvedImage[]>;
	/** Resolved profile-image URL (undefined = none). */
	profileImageSrc?: string;
	/** Page key -> resolved thumbnail URL, for rendering sub-page cards. */
	pageThumbs?: Record<string, string>;
	/** Custom fonts with resolved URLs (the editor preview passes blob: URLs). */
	fontFaces?: Array<{ name: string; url: string }>;
}

export type PageKey = string;

/** Join a path onto the site base so links work at root or in a subfolder. */
export const withBase = (base: string, path = ''): string =>
	`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

/** Strip leading/trailing slashes for comparing route segments. */
export const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '');
