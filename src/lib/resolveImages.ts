// Astro-only bridge between the image pipeline and the shared portfolio
// components. The components take plain `src` strings; here we run each image
// through Astro's optimizer (getImage) and attach its caption metadata.
import { getImage } from 'astro:assets';
import { getGallery, getAsset } from './galleries';
import { content } from './content';
import type { ResolvedImage } from '../portfolio/types';

/** Ordered, optimized, caption-carrying images for one gallery folder. */
export async function resolveGallery(folder: string): Promise<ResolvedImage[]> {
	const page = Object.values(content.pages).find((p) => p.gallery?.folder === folder);
	const gallery = page?.gallery;
	const order = gallery?.order ?? 'asc';
	const alt = gallery?.alt ?? '';
	const items = content.galleries[folder]?.items ?? {};

	const entries = getGallery(folder, order, items);
	return Promise.all(
		entries.map(async (entry) => {
			const optimized = await getImage({ src: entry.image, width: 800 });
			const srcSet = optimized.srcSet?.attribute || undefined;
			return {
				src: optimized.src,
				srcSet,
				alt,
				title: entry.title,
				description: entry.description,
				link: entry.link,
			} satisfies ResolvedImage;
		}),
	);
}

/**
 * Best available social-card image: the profile photo, else the home gallery's
 * first image (in that gallery's display order). Most platforms won't render an
 * SVG card, so the favicon is never used; undefined means "emit no og:image".
 */
export async function resolveOgImage(): Promise<string | undefined> {
	const home = content.pages.home?.gallery;
	const image =
		getAsset(content.profile.image) ??
		(home ? getGallery(home.folder, home.order)[0]?.image : undefined);
	if (!image) return undefined;
	const optimized = await getImage({ src: image, width: 1200 });
	return optimized.src;
}

/** Optimized profile image src (undefined if the file isn't found). */
export async function resolveProfileImage(): Promise<{ src?: string }> {
	const image = getAsset(content.profile.image);
	if (!image) return {};
	const optimized = await getImage({ src: image, width: 320 });
	return { src: optimized.src };
}
