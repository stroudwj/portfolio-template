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

// Uploaded fonts live under src/assets/fonts/ so publishing manages them like images.
// `?url` gives the built, hashed URL for the @font-face src.
const fonts = import.meta.glob<string>('/src/assets/fonts/*.{woff,woff2,ttf,otf}', {
	eager: true,
	query: '?url',
	import: 'default',
});

/** Built URL for a custom font's `file` path (e.g. "fonts/my-font.woff2"). */
export function getFontUrl(file: string): string | undefined {
	return fonts[`/src/assets/${file}`];
}
