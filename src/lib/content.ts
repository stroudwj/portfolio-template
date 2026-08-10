// Typed access to the site's single content source, src/data/content.json.
//
// Every component and page imports from here (or from ./galleries.ts) instead of
// hardcoding text. To change what the site says, edit content.json — never these
// components. The shapes below describe that file so editors get autocomplete and
// the build fails loudly if the data drifts from what the pages expect.
import data from '../data/content.json';
import { CONTENT_SCHEMA_VERSION, parseAndMigrateContent } from './content-schema';
import type { ContactEmailParts } from '../portfolio/contactEmail';

export { CONTENT_SCHEMA_VERSION, parseAndMigrateContent } from './content-schema';

/** Credit seeded into every new portfolio. Artists can edit or remove it in Site. */
export const DEFAULT_FOOTER = 'Made with hangwork.art';

/** Optional minimum height for one published section breakpoint. Pixel values
 * are retained for older documents; `*Vw` keeps newly resized page sections in
 * proportion with their width-scaling freeform contents. */
export interface ResponsiveSectionHeight {
	desktop?: number;
	phone?: number;
	desktopVw?: number;
	phoneVw?: number;
	/** Explicit trailing space. Preferred over legacy total minimum heights. */
	desktopGap?: number;
	phoneGap?: number;
}

export interface Site {
	/** Owner name — the single source of truth, reused in the logo and every page title. */
	name: string;
	/** Which identity is shown in the site header. Absent legacy content is inferred from the available logo fields. */
	headerMode?: HeaderMode;
	/** Optional logo override; falls back to `name` when omitted or empty. */
	logo?: string;
	/** Optional logo image (path under src/assets/); shown in the header instead of the text logo. */
	logoImage?: string;
	/** Meta description used for SEO and social cards. */
	description: string;
	/** Favicon file name, served from public/. */
	favicon: string;
	/** Language used by browsers and screen readers. Defaults to English. */
	language?: string;
	/** Hand-drawn signature, signed at the foot of every page. Absent = none. */
	signature?: SignatureData;
	/** Footer line(s) shown at the bottom of every page. "\n" is a line break; absent/empty = no footer. */
	footer?: string;
	/** Optional footer image (path under src/assets/). */
	footerImage?: string;
	/** Optional independent Freeform placement for the footer image. */
	footerImageLayout?: ImageLayout;
	/** Optional minimum footer height, independently adjustable for desktop and phone. */
	footerHeights?: ResponsiveSectionHeight;
	/** Display-scale closing name above the footer columns (Mosley's giant footer wordmark). */
	footerName?: string;
	/** footerName size in pt. Absent = 72. */
	footerNameSize?: number;
	/** Up to three headed link columns (e.g. "Site map" / "Contact"). */
	footerColumns?: FooterColumn[];
	/** Social-card image (path under src/assets/). Absent = automatic (profile photo, else first home image). */
	ogImage?: string;
	/** Optional site-wide flourishes configured in the editor's Design area. Absent = none. */
	creative?: CreativeConfig;
}

/** One headed footer link column ("Site map": Bio / Portfolio / Awards). */
export interface FooterColumn {
	heading?: string;
	links: FooterLink[];
}

/** A footer link. Internal when the url has no scheme (a page path like 'portraits'). */
export interface FooterLink {
	label: string;
	url: string;
}

/** The pointer-trail flavors a site can turn on. */
export type CreativeTrail = 'sparkles' | 'hearts' | 'bubbles';

/** The temporary marks visitors can leave by clicking open areas of the page. */
export type CreativeClickMark = 'nail' | 'cross' | 'star';

/** Curated site-wide film treatments. */
export type FilmTexturePreset = 'fine-grain' | 'dust' | 'projector';

/** Page-change choreography. Gallery uses the browser's shared-image transition
 * when available and falls back to the same restrained fade as older browsers. */
export type PageTransition = 'fade' | 'slide' | 'curtain' | 'gallery';

/** Motion-heavy effects can be independently disabled on small screens. */
export type CreativeEffectKey =
	| 'film'
	| 'pageTransition'
	| 'trail'
	| 'clickMark'
	| 'looseHang'
	| 'slowReveal'
	| 'artworkWobble'
	| 'colorSpin';

export interface FilmTextureConfig {
	preset: FilmTexturePreset;
	/** Under the artwork by default; "over" recreates an optical film overlay. */
	layer?: 'over';
	/** Overall opacity, 1–30. */
	intensity?: number;
	/** Texture scale, 50–200. */
	size?: number;
	/** Frame cadence, 25–200. */
	speed?: number;
	/** Projector-like luminance variation. */
	flicker?: boolean;
	/** Projector-like fractional frame movement. */
	weave?: boolean;
}

/**
 * Playful site-wide effects, all off by default. Rendered by
 * portfolio/CreativeEffects in both the editor preview and the published site.
 */
export interface CreativeConfig {
	/** Emoji drawn as the visitor's cursor (empty/absent = the normal cursor). */
	cursor?: string;
	/** Uploaded cursor image path under src/assets/. Takes priority over the emoji cursor. */
	cursorImage?: string;
	/** Little shapes trailing the pointer as it moves. */
	trail?: CreativeTrail;
	/** Paper-grain texture overlay opacity, 1–30 (%). Absent/0 = off. */
	grain?: number;
	/** A temporary mark left wherever a visitor clicks or taps the page. */
	clickMark?: CreativeClickMark;
	/** Give artwork a very slight, deterministic rotation, like a hand-hung salon wall. */
	looseHang?: boolean;
	/** Maximum site-wide hand-hung tilt in degrees, 0.25–5. */
	hangStrength?: number;
	/** Fade artwork into place when a page opens. */
	slowReveal?: boolean;
	/** Give artwork a quick shake when a visitor hovers over it. */
	artworkWobble?: boolean;
	/** Cycle artwork through the color wheel while it is hovered. */
	colorSpin?: boolean;
	/** A living, deliberately low-frame-rate film surface. */
	film?: FilmTextureConfig;
	/** Transition used when opening another portfolio page. */
	pageTransition?: PageTransition;
	/** Per-effect phone overrides. Missing keys preserve the existing on-phone behavior. */
	phone?: Partial<Record<CreativeEffectKey, boolean>>;
}

/** Scroll choreography that can be applied independently to every page section.
 * 'none' pins a section still even when the site's motion vocabulary is on —
 * an absent entry inherits the site feel instead. */
export type SectionMotionEffect = 'reveal' | 'drift' | 'pin' | 'scrub' | 'sequence' | 'none';

export interface SectionMotionConfig {
	effect: SectionMotionEffect;
	/** Visual strength, 1–100. */
	intensity?: number;
	/** Motion stays off on phones unless explicitly enabled. */
	phone?: boolean;
}

/** Typography treatments kept intentionally preset-sized instead of exposing a
 * full animation timeline. */
export type KineticTextEffect = 'words' | 'letters' | 'lines' | 'marquee';

export interface KineticTextConfig {
	effect: KineticTextEffect;
	/** Relative duration, 50–200. */
	speed?: number;
	/** Set false to keep this text still on phones. */
	phone?: boolean;
}

/** The physical mounting treatments an artwork can hang with. */
export type ArtworkMount =
	| 'tape'
	| 'nail'
	| 'hook'
	| 'frame'
	| 'mat'
	| 'frame-oak'
	| 'frame-walnut'
	| 'tack'
	| 'corners-nail'
	| 'corners-tape'
	| 'corners-tack'
	| 'photo-corners';

/** Curated motion applied to one artwork without changing its layout.
 * hover 'none' keeps this piece still even when the site's hover motion is on;
 * 'caption' shows the title on hover for just this piece (site dial permitting).
 * Absent inherits the site setting. */
export interface ArtworkEffectConfig {
	hover?: 'lift' | 'tilt' | 'zoom' | 'mono' | 'none' | 'caption';
	reveal?: 'fade' | 'rise' | 'wipe';
	/** Override the site/page hanging choice for this artwork. */
	hang?: boolean;
	/** Signed artwork rotation in degrees, -6–6. */
	skew?: number;
	/** A physical mounting treatment drawn around this artwork. */
	mount?: ArtworkMount;
	/** Set false to keep this artwork still on phones. */
	phone?: boolean;
}

/**
 * A signature drawn in the editor's pad: strokes of [x, y] points in a fixed
 * 300×120 coordinate space (SIGNATURE_VIEW). Rendered as inline SVG polylines
 * in the site's text color.
 */
export interface SignatureData {
	strokes: number[][][];
	/** Optional uploaded signature image, served from public/ when published. */
	image?: string;
	/** Horizontal placement at the foot of the site. Absent = centered. */
	align?: 'left' | 'center' | 'right';
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
	/** Optional independent text colors. Missing values stay linked to textColor. */
	bodyTextColor?: string;
	headingTextColor?: string;
	subheadingTextColor?: string;
	/** Font for headings (page titles + the text logo). Absent = same as fontFamily. */
	headingFontFamily?: string;
	/** Signed vertical offset (px) between the site header and page content. Absent = 0. */
	contentGap?: number;
	/** Header logo size as a percentage (50–200) of the default. Absent = 100. */
	logoScale?: number;
	/** Site-wide small-heading size as a percentage of the default. Absent = 100. */
	subheadingScale?: number;
	/** Site-wide page-heading size as a percentage of the default. Absent = 100. */
	pageHeadingScale?: number;
	/** Placement of page headings such as “Selected Works”. Absent = right. */
	pageHeadingPosition?: PageHeadingPosition;
	/** Freeform page-heading horizontal anchor as a viewport percentage. */
	pageHeadingX?: number;
	/** Freeform page-heading distance from the top of its color band in pixels.
	 * Negative values (to −120) lift the heading up toward the header area. */
	pageHeadingY?: number;
	/** Header logo/name placement. Absent = centered. */
	logoPosition?: LogoPosition;
	/** Freeform header horizontal position as a viewport percentage. */
	logoX?: number;
	/** Freeform header distance from the top edge in pixels. */
	logoY?: number;
	/** Site-wide navigation layout. Absent = 'dock' (the classic left magnify sidebar). */
	navStyle?: NavStyle;
	/** Fine horizontal navigation adjustment in pixels. Absent = the style default. */
	navOffsetX?: number;
	/** Fine vertical navigation adjustment in pixels. Absent = the style default. */
	navOffsetY?: number;
	/** Phones open the menu as a full-screen fade-in overlay instead of the compact corner box. */
	fullscreenMobileMenu?: boolean;
	/** Automatically choose readable text over page/section colors. Absent = enabled. */
	automaticTextContrast?: boolean;
	/** Pin the logo and chosen navigation layout while scrolling. Absent = enabled. */
	stabilizeNavigation?: boolean;
	/** Pin the header logo/name independently from the navigation. */
	stabilizeLogo?: boolean;
	/** A site-wide physical wall surface behind the portfolio. */
	backgroundTexture?: 'corkboard' | 'blackboard' | 'wood' | 'fence' | 'concrete';
	/** Texture strength as a percentage (0–100). Absent = 100 (full texture). */
	textureOpacity?: number;
	/** Texture hue shift in degrees (−180 to 180). Absent = 0 (as shipped). */
	textureHue?: number;
	/** false removes the default underline on text links; an explicit Underline
	 * mark on a linked run still wins. Absent = underlined (the classic look). */
	linkUnderline?: boolean;
	/** The site's motion feel — a small shared vocabulary every template can
	 * preset and one Design dial adjusts. Absent = off (exactly the pre-motion
	 * rendering), so older sites never change appearance. */
	motion?: SiteMotionConfig;
	/** Fonts uploaded in the editor, available alongside the factory list. */
	customFonts?: CustomFont[];
}

/** The one site-level motion dial. Absent and 'off' render identically. */
export type SiteMotionIntensity = 'off' | 'subtle' | 'full';

/** Site-wide motion vocabulary (spec: motion primitives). Primitives are CSS-driven
 * decorations — they may transform and fade but never change layout. Unset
 * primitive flags default to the house feel (reveal/hover/stagger on; the two
 * opinionated ones, heroParallax and hoverCaptions, stay opt-in for templates). */
export interface SiteMotionConfig {
	intensity?: SiteMotionIntensity;
	/** Sections fade and rise as they enter the viewport. */
	reveal?: boolean;
	/** Gallery images zoom slightly under the pointer. */
	hover?: boolean;
	/** Image titles fade in over gallery images on hover. */
	hoverCaptions?: boolean;
	/** The page's first section drifts at a reduced scroll rate. */
	heroParallax?: boolean;
	/** Images hang onto the wall in sequence when a page loads. */
	stagger?: boolean;
	/** Default scroll scene for every section — the site level of the spec-24
	 * cascade (section → page → site → house feel). Absent = the house feel;
	 * 'none' keeps sections still unless a page or section picks its own scene. */
	scene?: SectionMotionConfig;
}

/** The navigation layouts an artist can pick from the Design area. */
export type NavStyle = 'dock' | 'topbar' | 'centered' | 'pill' | 'minimal' | 'three-zone';
export type HeaderMode = 'name' | 'text' | 'image';
export type LogoPosition = 'left' | 'center' | 'freeform';
export type PageHeadingPosition = 'left' | 'center' | 'right' | 'freeform';

export interface NavItem {
	/** Page file name in src/pages/ without extension ('' for the Home page). */
	path: string;
	label: string;
	/** Keeps the page published but removes it from the visible menu. */
	hidden?: boolean;
}

export interface Profile {
	/** Name shown in About content; independent from the header/site name. */
	name?: string;
	/** Image file living in src/assets/ (resolved via ./galleries.ts). */
	image: string;
	/** About-page body. "\n" is a line break; "\n\n" is a blank line. */
	bio: string;
	/** Structured formatting for the About bio. Absent preserves legacy plain text. */
	bioRichText?: RichTextParagraph[];
	/** Optional About-only font; absent follows the site body font. */
	bioFontFamily?: string;
	/** About-photo presentation. Missing values preserve the original natural image. */
	imageWidth?: number;
	imageAspect?: string;
	imageFocusX?: number;
	imageFocusY?: number;
	imageCropZoom?: number;
	/** Freeform placement for the About photo; absent keeps it beside the bio. */
	imageLayout?: ImageLayout;
	/** Freeform placement for the About words/links as one independently movable element. */
	contentLayout?: ImageLayout;
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

/** One Stripe-hosted checkout choice for a product, such as a size or edition. */
export interface StoreOffer {
	id: string;
	label: string;
	/** Display price in the store currency's smallest unit (for example, cents). */
	amountMinor: number;
	checkout: {
		provider: 'stripe_payment_link';
		url: string;
	};
}

/** A reusable catalog item that can appear in any products page block. */
export interface StoreProduct {
	id: string;
	name: string;
	description?: string;
	/** Path under src/assets/. The editor keeps working image slots separately. */
	image?: string;
	/** Accessibility description for the product image. */
	imageAlt: string;
	status: 'draft' | 'available' | 'sold_out';
	offers: StoreOffer[];
}

export interface StoreConfig {
	/** ISO 4217 currency code used to format every display price in this catalog. */
	currency: string;
	/** Catalog order is storefront order unless a products block selects explicit ids. */
	products: StoreProduct[];
}

export type GalleryLayoutMode = 'freeform' | 'grid';

/** Optional phone-only presentation for one item. Automatic phone layouts do not
 * write any of these values; they exist only after the artist explicitly chooses
 * "Customize phone layout" for a gallery. */
export interface MobileItemStyle {
	/** Percentage of the phone content width (kept deliberately preset-like in the UI). */
	width?: number;
	align?: 'left' | 'center' | 'right';
	hidden?: boolean;
}

/** A gallery's independent phone arrangement. Absence means the editor and
 * published site keep generating the phone layout automatically. */
export interface MobileComposition {
	mode: 'custom';
	/** Stable item keys such as `image:<id>`, `text:<id>`, and `video:<id>`. */
	order: string[];
	items?: Record<string, MobileItemStyle>;
	/** Grid galleries may stay one column or use a compact two-column phone grid. */
	columns?: 1 | 2;
}

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
	/** Grid mode: pack images into aspect-aware justified rows (mixed horizontal/vertical
	 * pieces, no forced crops). Absent = the classic uniform grid, so existing docs keep
	 * their current look until the artist flips the toggle. */
	smartGrid?: boolean;
	/** Smart grid: seeded per-artwork size/placement variance, like a hung gallery wall. */
	galleryWall?: boolean;
	/** Grid gaps in rem — between images in a row (gapX) and between rows (gapY).
	 * Absent = the historic 1.25rem. */
	gapX?: number;
	gapY?: number;
	/** Extra image groups may opt into a one-image-at-a-time, click-through carousel. */
	carousel?: boolean;
	/** Carousel image sizing: fit shows the full image; fill crops it to the frame. */
	carouselFit?: 'fit' | 'fill';
	/** Freeform carousel frame placement and aspect ratio within its page section. */
	carouselFrame?: ImageLayout;
	/** Let the carousel frame's width and height resize independently. */
	carouselFreeResize?: boolean;
	/** Keep the numeric W:H controls visible even if the custom value matches a preset. */
	carouselCustomRatio?: boolean;
	/** Drag the active image within its frame instead of moving the carousel. Defaults to false. */
	carouselMoveImage?: boolean;
	/** Block ID of a freeform image-group canvas this carousel was explicitly dropped onto. */
	carouselHost?: string;
	/** Show the current/total number beneath the carousel. Defaults to true. */
	carouselShowCount?: boolean;
	/** Show the current image title beneath the carousel. Defaults to false. */
	carouselShowTitle?: boolean;
	/** Require alt text or a decorative choice when uploading to this carousel. */
	carouselRequireAlt?: boolean;
	/** Visual treatment for the previous/next controls. */
	carouselArrowStyle?: 'chevron' | 'arrow' | 'circle' | 'tab';
	/** Visual treatment around the carousel stage. */
	carouselFrameStyle?: 'none' | 'line' | 'shadow' | 'mat';
	/** Optional color for carousel arrows and frames. */
	carouselChromeColor?: string;
	/** Arrow glyph color, independent from the frame/button chrome. */
	carouselArrowColor?: string;
	/** Opt-in independent phone arrangement. Absent = a complete automatic layout. */
	mobile?: MobileComposition;
}

export type TextAlign = 'left' | 'center' | 'right';
export type TextStyle = 'body' | 'heading' | 'subheading' | 'quote';
export type RichTextSize = 'body' | 'subheading' | 'heading';

/** One safely-rendered inline run inside a rich text box. */
export interface RichTextRun {
	text: string;
	/** Link applied only to this run of selected words. */
	link?: string;
	size?: RichTextSize;
	/** Exact print-style size selected in the editor. Presets use 12/18/32pt. */
	fontSize?: number;
	bold?: true;
	italic?: true;
	underline?: true;
	strike?: true;
}

/** One independently aligned paragraph inside a rich text box. */
export interface RichTextParagraph {
	align?: TextAlign;
	runs: RichTextRun[];
}

export interface FormField {
	id: string;
	type: 'name' | 'email' | 'text' | 'textarea';
	label: string;
	required?: boolean;
}

/** How a page's sub-pages are presented by the 'children' block. */
export type ChildrenStyle = 'cards' | 'large' | 'list' | 'index';

/** One independently labelled/linkable card in a Sub-pages block. */
export interface ChildPageItem {
	id: string;
	/** Destination page key. It may be an owned sub-page or any existing page. */
	page: string;
	/** Card text is independent from the destination page's own name. */
	label?: string;
	/** Optional independent Freeform placement; absent keeps this card in flow. */
	layout?: ImageLayout;
}

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
	/** Explicit canvas layer order. Missing values use the legacy list order. */
	z?: number;
}

/** Horizontal width and placement for a text box that remains in page flow. */
export interface TextFlowLayout {
	x: number;
	w: number;
}

/**
 * One ordered piece of a page's body. 'text' is free text placeable anywhere;
 * 'embed' is a hosted video, audio player, or map (its optional `layout` pins it onto
 * the page's freeform canvas, like images); 'gallery' renders the page's
 * gallery; 'images' is an extra self-contained image group (its own folder +
 * layout settings), so one page can hold several canvases/grids; 'children'
 * renders the page's sub-pages as thumbnail cards; 'about' renders the profile
 * section (bio, email, social links).
 */
export type PageBlock =
	| {
			id: string;
			type: 'text';
			/** Plain-text mirror retained for compatibility, search, and empty checks. */
			text: string;
			/** Structured inline formatting. Absent means this is a legacy plain-text block. */
			richText?: RichTextParagraph[];
			/** Independent box font. Absent stays linked to the page body font. */
			fontFamily?: string;
			/** Legacy whole-block alignment used when richText is absent. */
			align?: TextAlign;
			/** Legacy whole-block size/style used when richText is absent. */
			style?: TextStyle;
			/** Optional card color behind the words (auto-contrast text applies). */
			background?: string;
			link?: string;
			/** Optional entrance or looping typography treatment for this text box. */
			kinetic?: KineticTextConfig;
			/** Width and horizontal position while the box remains in normal flow. */
			flowLayout?: TextFlowLayout;
			layout?: TextLayout;
		}
	| {
			id: string;
			type: 'embed';
			url: string;
			/** Keeps an empty/new module labelled for its intended provider family. */
			kind?: 'video' | 'audio' | 'map';
			/** Width and horizontal position while the embed remains in normal flow. */
			flowLayout?: TextFlowLayout;
			layout?: ImageLayout;
		}
	| {
			id: string;
			/** A short clip whose playhead follows page scroll. */
			type: 'shots';
			/** Direct web URL or published path under public/. */
			src: string;
			/** Browser-draft upload bookkeeping; removed from published content. */
			assetId?: string | null;
			filename?: string;
			/** Scroll scene length in viewport heights. */
			scrollLength?: number;
			/** Fade the clip away near the end so following page content takes over. */
			fadeIntoPage?: boolean;
			/** Scene progress, in percent, where the fade begins. */
			fadeStart?: number;
			/** Length of the fade, in percent of the scroll scene. */
			fadeDuration?: number;
			fit?: 'cover' | 'contain';
			/** Motion stays off on phones unless explicitly enabled. */
			phone?: boolean;
		}
	| { id: string; type: 'gallery' }
	| { id: string; type: 'images'; gallery: GalleryConfig; /** Editor-only display name so groups are tellable apart. */ name?: string }
	| {
			id: string;
			type: 'children';
			/** Presentation of the sub-page cards; absent = 'cards'. */
			style?: ChildrenStyle;
			/** Optional placement of the complete sub-page collection on its section canvas. */
			canvasLayout?: ImageLayout;
			/** Current blocks store individual cards; absent preserves legacy page.children behavior. */
			items?: ChildPageItem[];
		}
	| { id: string; type: 'about' }
	| { id: string; type: 'button'; label: string; url: string; align?: TextAlign; appearance?: 'solid' | 'outline' }
	| {
			id: string;
			type: 'divider';
			style?: 'line' | 'double' | 'dotted' | 'ornament';
			width?: 'short' | 'medium' | 'full';
			color?: string;
			/** Freeform divider placement within its section canvas. */
			layout?: ImageLayout;
		}
	| {
			id: string;
			type: 'products';
			/** Omitted means every non-draft catalog product in catalog order. */
			productIds?: string[];
			layout?: 'grid' | 'featured';
			/** Optional placement of the complete product collection on its section canvas. */
			canvasLayout?: ImageLayout;
		}
	| {
			id: string;
			type: 'project';
			project: ProjectDetails;
			labels?: Partial<Record<ProjectFieldKey, string>>;
			order?: ProjectFieldKey[];
			fontFamily?: string;
			fontSize?: number;
			layout?: ImageLayout;
		}
	| {
			id: string;
			type: 'contact';
			heading?: string;
			text?: string;
			/** The address, split and encoded — never a readable address. */
			email: ContactEmailParts;
			buttonLabel?: string;
		}
	| {
			id: string;
			type: 'form';
			heading?: string;
			action: string;
			/** Artist/site-owner inbox used by the no-service email fallback, split +
			 * encoded — never a readable address. See portfolio/contactEmail.ts. Legacy
			 * drafts with a plain string are converted to this shape when parsed. */
			recipientEmail?: ContactEmailParts;
			successMessage?: string;
			fields: FormField[];
			/** Optional image-like placement on the section's freeform canvas. */
			layout?: ImageLayout;
		}
	| {
			id: string;
			type: 'shape';
			/** Three primitives only — this is deliberately not a drawing tool. */
			shape: 'line' | 'arrow' | 'rectangle';
			/** Stroke color. Absent = the theme ink (text color). */
			color?: string;
			/** Stroke width in px. Absent = 1 (hairline). */
			strokeWidth?: number;
			/** Arrows only: which way the head points. Absent = 'right'. */
			direction?: 'right' | 'left' | 'up' | 'down';
			/** Freeform placement within its section canvas; shapes are born freeform. */
			layout?: ImageLayout;
		}
	| {
			id: string;
			type: 'accordion';
			/** Full-width rows in order; each title toggles its body text open. */
			items: AccordionItem[];
			/** Row-title size in pt — display scale is expected (Mosley runs ~92pt). Absent = 56. */
			titleSize?: number;
			/** Row-title font override. Absent = the theme heading font. */
			fontFamily?: string;
		};

/** One accordion row: a display-scale title over collapsible body text. */
export interface AccordionItem {
	id: string;
	title: string;
	text?: string;
}

/**
 * One movable page region. Blocks belong to exactly one section and the section
 * owns their shared background, motion, responsive height, and freeform canvas.
 * `editorColor` is an organizational label used only in the editor.
 */
export interface PageSection {
	id: string;
	name: string;
	blockIds: string[];
	editorColor?: string;
}

export interface PageConfig {
	/** Browser-tab title. "{name}" is replaced with site.name by pageTitle(). */
	title: string;
	/** Display name — nav entry for top-level pages, card caption for sub-pages. */
	label?: string;
	/** Meta description for THIS page (search results, link previews). Absent = site.description. */
	description?: string;
	/** Kept in the editor but left out of published bundles. */
	draft?: boolean;
	/** Publish the page while asking search engines not to list it. */
	noindex?: boolean;
	/** Optional on-page heading shown above the body. */
	heading?: string;
	/** Override the site-wide hanging choice for this page. */
	hanging?: boolean;
	/** Override the site-wide hand-hung tilt strength for this page, in degrees. */
	hangingStrength?: number;
	/** Present on gallery pages; absent on text-only pages like About. */
	gallery?: GalleryConfig;
	/** Ordered body blocks. Filled by the versioned parser for pre-block content. */
	blocks?: PageBlock[];
	/** Ordered, named containers for page blocks. Reordering a section moves all
	 * of its blocks together. Every current document has at least `main`. */
	sections?: PageSection[];
	/** Opt-in phone-only order/visibility for whole page sections. Absence keeps
	 * following the desktop block order automatically. */
	mobile?: MobileComposition;
	/** Ordered sub-page keys, shown as thumbnail cards via the 'children' block. */
	children?: string[];
	/** Card image for this page when it appears as a sub-page (path under src/assets/). */
	thumbnail?: string;
	/** Whole-page background color (color-blocking). Absent = the site background color. */
	background?: string;
	/** Per-section background colors keyed by page-part key ('block:<id>' / 'page:heading'). */
	sectionColors?: Record<string, string>;
	/** Per-section minimum heights keyed like sectionColors, with independent breakpoints. */
	sectionHeights?: Record<string, ResponsiveSectionHeight>;
	/** Per-section scroll choreography keyed like sectionColors. */
	sectionMotion?: Record<string, SectionMotionConfig>;
	/** Page-wide scroll scene. Sections without their own entry inherit this
	 * before the site's scene; 'none' keeps the whole page still. */
	motion?: SectionMotionConfig;
	/** Sections whose freeform canvas spans the viewport instead of the content
	 * column (x=0/100 become the screen edges), keyed like sectionColors. */
	sectionBleed?: Record<string, boolean>;
	/** Per-section top-edge blend into the previous section's color, keyed like
	 * sectionColors. 'fade' is a smooth gradient; 'dither' a halftone stipple. */
	sectionFades?: Record<string, 'fade' | 'dither'>;
	/** Optional typography treatment for the page heading. */
	headingKinetic?: KineticTextConfig;
	/** Structured, reusable project facts rendered beneath the page heading. */
	project?: ProjectDetails;
}

export type ProjectTemplate = 'artwork' | 'collaboration' | 'exhibition';

export interface ProjectDetails {
	template: ProjectTemplate;
	year?: string;
	medium?: string;
	dimensions?: string;
	collaborators?: string;
	exhibitionHistory?: string;
}

export type ProjectFieldKey = keyof Omit<ProjectDetails, 'template'>;

/** A block saved to the document's section library, including its visual behavior. */
export interface SavedSectionTemplate {
	id: string;
	name: string;
	block: PageBlock;
	motion?: SectionMotionConfig;
	color?: string;
	heights?: ResponsiveSectionHeight;
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
	/** Explicit canvas layer order. Missing values use the legacy list order. */
	z?: number;
	/** Editor lock: keeps an image selectable while preventing move and resize. */
	locked?: boolean;
}

export interface ImageMeta {
	[key: string]: unknown;
	/** Stable across publish/reload so optional phone arrangements can refer to this image. */
	id: string;
	/** Product-owned sample identity. The editor lifts this into its image slot; published bundles remove samples. */
	sampleAssetId?: string;
	title?: string;
	/** Accessibility description; deliberately separate from the visible title. */
	alt?: string;
	/** An intentional empty alt attribute, recorded explicitly instead of inferred. */
	decorative?: true;
	description?: string;
	link?: string;
	/** What selecting the image does. Absent preserves the legacy lightbox behavior. */
	clickAction?: 'lightbox' | 'link';
	/** Legacy grid width in columns (1–4); ignored once `layout` exists. */
	w?: number;
	/** Legacy grid height in row units (1–4); ignored once `layout` exists. */
	h?: number;
	/** Freeform canvas placement. Absent = auto-flowed until first arranged. */
	layout?: ImageLayout;
	/** Carousel fill-mode focal point, as percentages of the source image. */
	focusX?: number;
	focusY?: number;
	/** Per-image crop ratio used in freeform layouts, such as "1:1". */
	cropAspect?: string;
	/** Non-destructive crop magnification. */
	cropZoom?: number;
	/** Non-destructive light adjustments, in percent (100 = as shot). */
	brightness?: number;
	contrast?: number;
	/** Editor-only workbench organization; stripped from published gallery items. */
	workbenchFolder?: string;
	/** Per-artwork reveal/hover treatment. */
	effects?: ArtworkEffectConfig;
}

export interface GalleryData {
	[key: string]: unknown;
	/** Maps an image file name to its optional caption metadata. */
	items: Record<string, ImageMeta>;
}

export interface Content {
	schemaVersion: typeof CONTENT_SCHEMA_VERSION;
	site: Site;
	theme: Theme;
	nav: NavItem[];
	profile: Profile;
	contact: Contact;
	social: SocialLink[];
	resume: Resume;
	/** Optional sales catalog. Existing portfolios omit it and render unchanged. */
	store?: StoreConfig;
	/** Reusable page sections kept with the editable document and its backups. */
	sectionLibrary?: SavedSectionTemplate[];
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
 * Backward-compatible alias for callers that already have a typed Content object.
 * The parser clones, migrates, and validates rather than mutating the input.
 */
export function migrateContent(c: Content): Content {
	return parseAndMigrateContent(c);
}

export const content = parseAndMigrateContent(data);

/** Resolve a title template, replacing "{name}" with the site name. */
export const pageTitle = (template: string): string =>
	template.replace('{name}', content.site.name);
