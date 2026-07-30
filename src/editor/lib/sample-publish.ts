import { pageGalleryConfigs, type GalleryConfig, type MobileComposition, type PageBlock, type PageConfig } from '../../lib/content';
import { MAIN_SECTION_ID, pageSections, sectionPartKey } from '../../lib/pageSections';
import type { EditorDoc } from './types';

export interface SampleAffectedPage {
	key: string;
	label: string;
	galleries: string[];
	sampleCount: number;
}

export interface SamplePublishImpact {
	sampleCount: number;
	pages: SampleAffectedPage[];
	blockedPages: Array<{ key: string; label: string }>;
}

function withoutItems(mobile: MobileComposition | undefined, itemKeys: Set<string>): MobileComposition | undefined {
	if (!mobile) return mobile;
	const items = Object.fromEntries(
		Object.entries(mobile.items ?? {}).filter(([key]) => !itemKeys.has(key)),
	);
	return {
		...mobile,
		order: mobile.order.filter((key) => !itemKeys.has(key)),
		items: Object.keys(items).length ? items : undefined,
	};
}

function stripGalleryMobile(
	config: GalleryConfig,
	removedIdsByFolder: ReadonlyMap<string, Set<string>>,
): GalleryConfig {
	const removed = removedIdsByFolder.get(config.folder);
	if (!removed?.size) return config;
	return {
		...config,
		mobile: withoutItems(
			config.mobile,
			new Set([...removed].map((id) => `image:${id}`)),
		),
	};
}

function removePageSections(page: PageConfig, blockIds: Set<string>): PageConfig {
	if (!blockIds.size) return page;
	const sections = pageSections(page)
		.map((section) => ({
			...section,
			blockIds: section.blockIds.filter((id) => !blockIds.has(id)),
		}))
		.filter((section) => section.id === MAIN_SECTION_ID || section.blockIds.length > 0);
	const keptSectionIds = new Set(sections.map((section) => section.id));
	const originalSections = pageSections(page);
	const emptiedSectionIds = new Set(
		originalSections
			.filter((section) => section.blockIds.every((id) => blockIds.has(id)))
			.map((section) => section.id),
	);
	const legacyBlockKeys = [...blockIds]
		.filter((id) =>
			originalSections.some(
				(section) =>
					section.blockIds.includes(id) && emptiedSectionIds.has(section.id),
			),
		)
		.map((id) => `block:${id}`);
	const partKeys = new Set([
		...legacyBlockKeys,
		...originalSections
			.filter(
				(section) =>
					!keptSectionIds.has(section.id) || emptiedSectionIds.has(section.id),
			)
			.map((section) => sectionPartKey(section.id)),
	]);
	const sectionColors = Object.fromEntries(
		Object.entries(page.sectionColors ?? {}).filter(([key]) => !partKeys.has(key)),
	);
	const sectionHeights = Object.fromEntries(
		Object.entries(page.sectionHeights ?? {}).filter(([key]) => !partKeys.has(key)),
	);
	const sectionMotion = Object.fromEntries(
		Object.entries(page.sectionMotion ?? {}).filter(([key]) => !partKeys.has(key)),
	);
	return {
		...page,
		sections,
		mobile: withoutItems(page.mobile, partKeys),
		sectionColors: Object.keys(sectionColors).length ? sectionColors : undefined,
		sectionHeights: Object.keys(sectionHeights).length ? sectionHeights : undefined,
		sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
	};
}

function pageLabel(doc: EditorDoc, key: string): string {
	if (key === 'home') return doc.content.pages[key]?.label || doc.content.nav.find((item) => item.path === '')?.label || 'Home';
	return doc.content.pages[key]?.label || doc.content.nav.find((item) => item.path === key)?.label || key;
}

function pageHasMeaningfulContent(doc: EditorDoc, page: PageConfig): boolean {
	for (const block of page.blocks ?? []) {
		if (block.type === 'gallery' && page.gallery && (doc.galleries[page.gallery.folder]?.length ?? 0) > 0)
			return true;
		if (block.type === 'images' && (doc.galleries[block.gallery.folder]?.length ?? 0) > 0) return true;
		if (block.type === 'text' && block.text.trim()) return true;
		if (block.type === 'embed' && block.url.trim()) return true;
		if (block.type === 'button' && block.label.trim() && block.url.trim()) return true;
		if (block.type === 'children' && (page.children?.length ?? 0) > 0) return true;
		if (block.type === 'products') {
			const ids = block.productIds ?? doc.content.store?.products.map((product) => product.id) ?? [];
			if (ids.length > 0) return true;
		}
		if (block.type === 'form' && block.action.trim()) return true;
		if (
			block.type === 'about' &&
			(doc.content.profile.bio.trim() ||
				doc.content.contact.email.trim() ||
				doc.content.social.length > 0 ||
				!!doc.profileImage.filename ||
				!!doc.profileImage.assetId)
		)
			return true;
	}
	return false;
}

export function samplePublishImpact(doc: EditorDoc): SamplePublishImpact {
	const sampleCountByFolder = new Map<string, number>();
	for (const [folder, entries] of Object.entries(doc.galleries)) {
		const count = entries.filter((entry) => !!entry.sampleAssetId).length;
		if (count) sampleCountByFolder.set(folder, count);
	}
	const pages: SampleAffectedPage[] = [];
	for (const [key, page] of Object.entries(doc.content.pages)) {
		const galleries = pageGalleryConfigs(page)
			.map((gallery) => gallery.folder)
			.filter((folder) => sampleCountByFolder.has(folder));
		if (!galleries.length) continue;
		const unique = [...new Set(galleries)];
		pages.push({
			key,
			label: pageLabel(doc, key),
			galleries: unique,
			sampleCount: unique.reduce((total, folder) => total + (sampleCountByFolder.get(folder) ?? 0), 0),
		});
	}
	const stripped = stripSamplesForPublishInternal(doc);
	const blockedPages = Object.entries(stripped.content.pages)
		.filter(([, page]) => !page.draft && !pageHasMeaningfulContent(stripped, page))
		.map(([key]) => ({ key, label: pageLabel(stripped, key) }));
	return {
		sampleCount: [...sampleCountByFolder.values()].reduce((total, count) => total + count, 0),
		pages,
		blockedPages,
	};
}

function stripSamplesForPublishInternal(doc: EditorDoc): EditorDoc {
	const next = JSON.parse(JSON.stringify(doc)) as EditorDoc;
	const removedIdsByFolder = new Map<string, Set<string>>();
	for (const [folder, entries] of Object.entries(next.galleries)) {
		const removed = new Set(entries.filter((entry) => !!entry.sampleAssetId).map((entry) => entry.id));
		if (removed.size) removedIdsByFolder.set(folder, removed);
		next.galleries[folder] = entries.filter((entry) => !entry.sampleAssetId);
		const contentItems = next.content.galleries[folder]?.items;
		if (contentItems) {
			for (const [filename, meta] of Object.entries(contentItems)) {
				if (meta.sampleAssetId) delete contentItems[filename];
			}
		}
	}

	for (const [key, sourcePage] of Object.entries(next.content.pages)) {
		let page: PageConfig = {
			...sourcePage,
			gallery: sourcePage.gallery
				? stripGalleryMobile(sourcePage.gallery, removedIdsByFolder)
				: undefined,
		};
		const removedBlocks = new Set<string>();
		const blocks: PageBlock[] = [];
		for (const block of page.blocks ?? []) {
			if (block.type === 'gallery' && page.gallery && (next.galleries[page.gallery.folder]?.length ?? 0) === 0) {
				removedBlocks.add(block.id);
				continue;
			}
			if (block.type === 'images') {
				if ((next.galleries[block.gallery.folder]?.length ?? 0) === 0) {
					removedBlocks.add(block.id);
					continue;
				}
				blocks.push({ ...block, gallery: stripGalleryMobile(block.gallery, removedIdsByFolder) });
				continue;
			}
			blocks.push(block);
		}
		page = { ...removePageSections(page, removedBlocks), blocks };
		next.content.pages[key] = page;
	}

	if (next.profileImage.sampleAssetId)
		next.profileImage = { filename: '', assetId: null, sampleAssetId: null };
	if (next.logoImage.sampleAssetId)
		next.logoImage = { filename: '', assetId: null, sampleAssetId: null };
	for (const [key, slot] of Object.entries(next.pageThumbs))
		if (slot.sampleAssetId) delete next.pageThumbs[key];
	for (const [key, slot] of Object.entries(next.productImages))
		if (slot.sampleAssetId)
			next.productImages[key] = { filename: '', assetId: null, sampleAssetId: null };
	return next;
}

/** The exact document sent to bundle generation after the artist opts in. */
export function stripSamplesForPublish(doc: EditorDoc): EditorDoc {
	return stripSamplesForPublishInternal(doc);
}
