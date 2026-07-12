// Resolves images from src/assets/ folders and joins them with the optional
// per-image caption data from content.json.
//
// import.meta.glob needs a *static* string literal, so the folder can't be passed
// in dynamically. Instead we glob every asset once, then select by folder key at
// runtime — this keeps Astro's image optimization and the "drop a file in the
// folder and it appears" workflow while letting content.json drive each gallery.
import type { ImageMeta } from './content';

const assets = import.meta.glob<{ default: ImageMetadata }>(
	[
		'/src/assets/*.{jpeg,jpg,png,gif,webp}',
		'/src/assets/**/*.{jpeg,jpg,png,gif,webp}',
	],
	{ eager: true },
);

export interface GalleryImage extends ImageMeta {
	image: ImageMetadata;
}

/**
 * Images for one gallery folder, in display order, each carrying its optional
 * caption metadata (title/description/link) keyed by file name.
 *
 * Order mirrors the template's previous behaviour exactly: glob keys arrive
 * sorted, so 'asc' is that natural order and 'desc' reverses it.
 */
export function getGallery(
	folder: string,
	order: 'asc' | 'desc' = 'asc',
	items: Record<string, ImageMeta> = {},
): GalleryImage[] {
	const prefix = `/src/assets/${folder}/`;
	const entries = Object.entries(assets).filter(([key]) => key.startsWith(prefix));

	if (order === 'desc') entries.reverse();

	return entries.map(([key, module]) => {
		const filename = key.slice(prefix.length);
		return { image: module.default, ...(items[filename] ?? {}) };
	});
}

/** Resolve a single asset (e.g. the profile image) by its path under src/assets/. */
export function getAsset(path: string): ImageMetadata | undefined {
	return assets[`/src/assets/${path}`]?.default;
}
