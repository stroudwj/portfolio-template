// Editor state types. The editor edits the SAME Content schema the site uses
// (imported from src/lib/content.ts), plus a little extra bookkeeping that the
// browser needs — ordered image lists and references to uploaded blobs.
import type { Content } from '../../lib/content';

export type { Content };

export interface ImageMeta {
	title: string;
	description: string;
	link: string;
	/** Grid width in columns (1–4; unset = 1). */
	w?: number;
	/** Grid height in row units (1–4; unset = 1). */
	h?: number;
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
	content: Content;
	/** folder name -> ordered image entries. */
	galleries: Record<string, ImageEntry[]>;
	profileImage: SingleImage;
	/** page key -> its sub-page card thumbnail. */
	pageThumbs: Record<string, SingleImage>;
	/** custom font name (content.theme.customFonts) -> its uploaded file. */
	fonts: Record<string, SingleImage>;
}
