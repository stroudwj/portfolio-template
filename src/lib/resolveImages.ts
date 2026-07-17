// Astro-only bridge between the image pipeline and the shared portfolio
// components. The components take plain `src` strings; here we run each image
// through Astro's optimizer (getImage) and attach its caption metadata.
import { getImage } from 'astro:assets';
import { getGallery, getAsset } from './galleries';
import { content, pageGalleryConfigs } from './content';
import type { GalleryConfig } from './content';
import type { ResolvedImage } from '../portfolio/types';

/** The config that owns a folder — a page's main gallery or one of its image groups. */
function configForFolder(folder: string): GalleryConfig | undefined {
	for (const page of Object.values(content.pages)) {
		const found = pageGalleryConfigs(page).find((g) => g.folder === folder);
		if (found) return found;
	}
	return undefined;
}

/** Ordered, optimized, caption-carrying images for one gallery folder. */
export async function resolveGallery(folder: string): Promise<ResolvedImage[]> {
	const gallery = configForFolder(folder);
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
				w: entry.w,
				h: entry.h,
				layout: entry.layout,
				// Natural ratio so auto-flowed canvas items get correct heights at build time.
				ar: entry.image.width && entry.image.height ? entry.image.width / entry.image.height : undefined,
			} satisfies ResolvedImage;
		}),
	);
}

/** Every gallery a page renders — its main folder plus any extra image groups. */
export async function resolvePageGalleries(pageKey: string): Promise<Record<string, ResolvedImage[]>> {
	const page = content.pages[pageKey];
	const out: Record<string, ResolvedImage[]> = {};
	if (!page) return out;
	for (const config of pageGalleryConfigs(page)) {
		if (!(config.folder in out)) out[config.folder] = await resolveGallery(config.folder);
	}
	return out;
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

/**
 * Resolved card images for a page's sub-pages: the child's explicit thumbnail if it
 * has one, else the first image of its gallery. Children with no image at all are
 * simply omitted (the card renders an empty placeholder).
 */
export async function resolveChildThumbs(pageKey: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const childKey of content.pages[pageKey]?.children ?? []) {
		const child = content.pages[childKey];
		if (!child) continue;
		let image = child.thumbnail ? getAsset(child.thumbnail) : undefined;
		if (!image && child.gallery) image = getGallery(child.gallery.folder, child.gallery.order)[0]?.image;
		if (!image) continue;
		out[childKey] = (await getImage({ src: image, width: 640 })).src;
	}
	return out;
}

/** Optimized profile image src (undefined if the file isn't found). */
export async function resolveProfileImage(): Promise<{ src?: string }> {
	const image = getAsset(content.profile.image);
	if (!image) return {};
	const optimized = await getImage({ src: image, width: 320 });
	return { src: optimized.src };
}

/** Optimized header-logo image src (undefined = the text logo renders instead). */
export async function resolveLogoImage(): Promise<string | undefined> {
	if (!content.site.logoImage) return undefined;
	const image = getAsset(content.site.logoImage);
	if (!image) return undefined;
	return (await getImage({ src: image, width: 480 })).src;
}
