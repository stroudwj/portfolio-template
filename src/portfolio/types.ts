// Shared prop types for the portfolio component system.
//
// These components are rendered in TWO places from the SAME source: the Astro
// site (static HTML at build) and the React editor preview (live). To stay
// framework-neutral they never touch Astro's image pipeline — callers resolve
// images to plain `src` strings first (Astro via getImage(), the editor via
// object URLs) and pass them in as `ResolvedImage`.
import type {
	Content,
	GalleryConfig,
	ImageLayout,
	LogoPosition,
	NavItem,
	NavStyle,
	SocialLink,
	StoreConfig,
	StoreProduct,
	TextAlign,
	TextLayout,
	TextStyle,
	ResponsiveSectionHeight,
} from '../lib/content';

export type {
	Content,
	GalleryConfig,
	ImageLayout,
	LogoPosition,
	NavItem,
	NavStyle,
	SocialLink,
	StoreConfig,
	StoreProduct,
	TextAlign,
	TextLayout,
	TextStyle,
	ResponsiveSectionHeight,
};

/** One atomic mixed-item move produced by a freeform canvas. */
export interface CanvasLayoutUpdates {
	images?: Record<string, ImageLayout>;
	texts?: Record<string, TextLayout>;
	embeds?: Record<string, ImageLayout>;
}

/** A text block placed on the freeform canvas (its `layout` is present). */
export interface CanvasText {
	id: string;
	text: string;
	align?: TextAlign;
	style?: TextStyle;
	link?: string;
	layout: TextLayout;
}

/** A video embed placed on the freeform canvas (its `layout` is present). */
export interface CanvasEmbed {
	id: string;
	url: string;
	layout: ImageLayout;
}

/** An image ready to render: a resolved URL plus its optional caption metadata. */
export interface ResolvedImage {
	/** Stable key for React lists (optional). */
	id?: string;
	src: string;
	srcSet?: string;
	/** Full-resolution URL for the lightbox (src/srcSet stay display-sized). */
	full?: string;
	alt: string;
	title?: string;
	description?: string;
	link?: string;
	/** Legacy grid width in columns (1–4, default 1). */
	w?: number;
	/** Legacy grid height in row units (1–4, default 1). */
	h?: number;
	/** Freeform canvas placement; absent = auto-flowed. */
	layout?: ImageLayout;
	/** Natural width/height ratio when the resolver knows it (Astro build does). */
	ar?: number;
}

/** Everything the portfolio needs to render, with images already resolved. */
export interface PortfolioData {
	content: Content;
	/** Folder name -> ordered, resolved images. */
	galleries: Record<string, ResolvedImage[]>;
	/** Resolved profile-image URL (undefined = none). */
	profileImageSrc?: string;
	/** Resolved header-logo image URL (undefined = text logo). */
	logoImageSrc?: string;
	/** Page key -> resolved thumbnail URL, for rendering sub-page cards. */
	pageThumbs?: Record<string, string>;
	/** Product ID -> resolved catalog image URL. */
	productImageSrcs?: Record<string, string>;
	/** Custom fonts with resolved URLs (the editor preview passes blob: URLs). */
	fontFaces?: Array<{ name: string; url: string }>;
	/** Resolved resume URL override (the editor preview passes a blob: URL). */
	resumeHref?: string;
}

export type PageKey = string;

/** Join a path onto the site base so links work at root or in a subfolder. */
export const withBase = (base: string, path = ''): string =>
	`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

/** Strip leading/trailing slashes for comparing route segments. */
export const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '');
