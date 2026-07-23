// Editor state types. The editor edits the SAME Content schema the site uses
// (imported from src/lib/content.ts), plus a little extra bookkeeping that the
// browser needs — ordered image lists and references to uploaded blobs.
import type { Content, ImageLayout } from '../../lib/content';

export type { Content, ImageLayout };

export interface ImageMeta {
	[key: string]: unknown;
	/** Written on export so published phone arrangements survive a later reload. */
	id?: string;
	title: string;
	/** Screen-reader description, separate from the visible artwork title. */
	alt: string;
	description: string;
	link: string;
	/** Legacy grid width in columns (1–4; unset = 1). Ignored once `layout` exists. */
	w?: number;
	/** Legacy grid height in row units (1–4; unset = 1). Ignored once `layout` exists. */
	h?: number;
	/** Freeform canvas placement (set the first time the image is arranged). */
	layout?: ImageLayout;
}

/** One image in a gallery (or the profile image), in the editor's working state. */
export interface ImageEntry {
	/** Stable id for React keys and drag-reorder. */
	id: string;
	/** File name (original upload name or one already referenced in the JSON). */
	filename: string;
	meta: ImageMeta;
	/** Key into the asset registry when the pixels were uploaded this session; null = reference only. */
	assetId: string | null;
}

/** A single standalone image slot (profile picture, page thumbnail). */
export interface SingleImage {
	filename: string;
	assetId: string | null;
}

/**
 * The full working document. `content` holds all text/config; `galleries`,
 * `profileImage` and `pageThumbs` hold the images (the source of truth the exporter
 * turns back into the folder-based Content schema).
 */
export interface EditorDoc {
	/** Version of the browser-only working document shape. */
	docVersion: 2;
	content: Content;
	/** folder name -> ordered image entries. */
	galleries: Record<string, ImageEntry[]>;
	profileImage: SingleImage;
	/** The header logo image (empty filename = the text logo renders). */
	logoImage: SingleImage;
	/** page key -> its sub-page card thumbnail. */
	pageThumbs: Record<string, SingleImage>;
	/** product id -> its editable image slot (uploaded or shared with gallery artwork). */
	productImages: Record<string, SingleImage>;
	/** custom font name (content.theme.customFonts) -> its uploaded file. */
	fonts: Record<string, SingleImage>;
	/** The résumé PDF linked from the About section (empty filename = none). */
	resumeFile: SingleImage;
	/** Social-card image choice; the exporter turns it into content.site.ogImage. Absent = automatic. */
	ogImage?: { folder: string; entryId: string };
}
