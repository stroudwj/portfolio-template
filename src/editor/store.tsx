import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { pageGalleryConfigs } from '../lib/content';
import type {
	ChildrenStyle,
	Content,
	CreativeConfig,
	FooterColumn,
	GalleryConfig,
	HeaderMode,
	ImageLayout,
	KineticTextConfig,
	MobileComposition,
	SignatureData,
	SocialLink,
	StoreOffer,
	StoreProduct,
	Theme,
	PageBlock,
	PageConfig,
	PageSection,
	ProjectDetails,
	ProjectTemplate,
	SavedSectionTemplate,
	SectionMotionConfig,
	RichTextParagraph,
	TextAlign,
	TextFlowLayout,
	TextLayout,
	TextStyle,
} from '../lib/content';
import {
	MAIN_SECTION_ID,
	NEW_SECTION_ID,
	pageSections,
	sectionPartKey,
} from '../lib/pageSections';
import { embedSpec, type EmbedKind } from '../portfolio/mediaEmbed';
import { DEFAULT_CONTACT_BUTTON_LABEL, EMPTY_CONTACT_EMAIL } from '../portfolio/contactEmail';
import type { CanvasSelection } from '../portfolio/types';
import type { EditorDoc, ImageEntry, ImageMeta } from './lib/types';
import { blankDoc, existingDoc, initDocFromContent, upgradeDoc } from './lib/content-init';
import {
	clearAssetRegistry,
	getAssetPersistenceStatus,
	getAssetsVersion,
	registerAsset,
	restoreAsset,
	subscribeAssets,
	uid,
	waitForAssetPersistence,
} from './lib/assets';
import { sanitizeFilename } from './lib/validation';
import {
	saveDoc,
	loadDoc as loadSavedDoc,
	hasSavedDoc,
	loadAllAssetBlobs,
	clearPersisted,
	backupDocBeforeMigration,
	saveNamedVersion,
} from './lib/persistence';
import { parseAndMigrateEditorDoc } from './lib/doc-schema';
import {
	bottomOf,
	canvasHeight,
	DEFAULT_AR,
	flowMissing,
	textBottom,
} from '../portfolio/canvasLayout';
import { entryWithSampleSuccessor } from './lib/sample-lifecycle';
import { contentWithThemePreset, starterSampleFallbackIds } from './lib/templates';
import { collectionLayoutAtCanvasBottom } from './lib/canvas-placement';
import { WORKBENCH_FOLDER } from './lib/image-transfer';
import { getSampleArtwork } from './lib/sample-artwork';

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
	const next = arr.slice();
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

function pageWithSections(page: PageConfig, sections = pageSections(page)): PageConfig {
	return { ...page, sections };
}

function appendBlockToSection(
	page: PageConfig,
	block: PageBlock,
	requestedSectionId?: string,
): PageConfig {
	const sections = pageSections(page);
	const newSection =
		requestedSectionId === NEW_SECTION_ID
			? {
					id: uid('section'),
					name: `Section ${sections.length + 1}`,
					blockIds: [] as string[],
				}
			: undefined;
	const availableSections = newSection ? [...sections, newSection] : sections;
	const target =
		newSection ??
		availableSections.find((section) => section.id === requestedSectionId) ??
		availableSections.find((section) => section.id === MAIN_SECTION_ID) ??
		availableSections[0];
	return {
		...page,
		blocks: [...(page.blocks ?? []), block],
		sections: availableSections.map((section) =>
			section.id === target.id
				? { ...section, blockIds: [...section.blockIds, block.id] }
				: section,
		),
	};
}

/** When the block's destination section hosts a freeform canvas, the lowest
 *  occupied canvas line (in canvas-width % units); null when the section has no
 *  free canvas. A canvas section composits in-flow blocks OVER the art, so new
 *  collection blocks there must land ON the canvas, below everything else. */
function freeCanvasBottomInSection(
	doc: EditorDoc,
	page: PageConfig,
	requestedSectionId?: string,
): number | null {
	if (requestedSectionId === NEW_SECTION_ID) return null;
	const sections = pageSections(page);
	const section =
		sections.find((candidate) => candidate.id === requestedSectionId) ??
		sections.find((candidate) => candidate.id === MAIN_SECTION_ID) ??
		sections[0];
	if (!section) return null;
	const blockById = new Map((page.blocks ?? []).map((block) => [block.id, block]));
	const sectionBlocks = section.blockIds
		.map((id) => blockById.get(id))
		.filter((block): block is PageBlock => !!block);
	const host = sectionBlocks.find(
		(block) =>
			(block.type === 'gallery' && !!page.gallery && page.gallery.layout !== 'grid') ||
			(block.type === 'images' && block.gallery.carousel !== true && block.gallery.layout !== 'grid'),
	);
	if (!host) return null;
	const config = host.type === 'gallery' ? page.gallery : host.type === 'images' ? host.gallery : undefined;
	if (!config) return null;
	const entries = doc.galleries[config.folder] ?? [];
	const flowed = flowMissing(
		entries.map((entry) => ({ layout: entry.meta.layout, ar: entry.meta.layout?.ar ?? DEFAULT_AR })),
	);
	const imageLayouts = entries.flatMap((entry, index) => {
		const layout = entry.meta.layout ?? flowed.get(index);
		return layout ? [layout] : [];
	});
	let bottom = canvasHeight(imageLayouts);
	for (const candidate of sectionBlocks) {
		if (candidate.type === 'text' && candidate.layout) bottom = Math.max(bottom, textBottom(candidate.layout));
		if (candidate.type === 'embed' && candidate.layout) bottom = Math.max(bottom, bottomOf(candidate.layout));
		if ((candidate.type === 'children' || candidate.type === 'products') && candidate.canvasLayout)
			bottom = Math.max(bottom, bottomOf(candidate.canvasLayout));
		if (candidate.type === 'project' && candidate.layout) bottom = Math.max(bottom, bottomOf(candidate.layout));
		if (candidate.type === 'form' && candidate.layout) bottom = Math.max(bottom, bottomOf(candidate.layout));
		if (candidate.type === 'divider' && candidate.layout) bottom = Math.max(bottom, bottomOf(candidate.layout));
	}
	return bottom;
}

function targetSectionId(page: PageConfig, requestedSectionId?: string): string {
	if (requestedSectionId === NEW_SECTION_ID) return NEW_SECTION_ID;
	const sections = pageSections(page);
	return (
		sections.find((section) => section.id === requestedSectionId)?.id ??
		sections.find((section) => section.id === MAIN_SECTION_ID)?.id ??
		sections[0].id
	);
}

function removeBlocksFromSections(page: PageConfig, blockIds: ReadonlySet<string>): PageSection[] {
	const sections = pageSections(page)
		.map((section) => ({
			...section,
			blockIds: section.blockIds.filter((id) => !blockIds.has(id)),
		}))
		.filter((section) => section.id === MAIN_SECTION_ID || section.blockIds.length > 0);
	return sections.length
		? sections
		: [{ id: MAIN_SECTION_ID, name: 'Main section', blockIds: [] }];
}

function blockSection(page: PageConfig, blockId: string): PageSection | undefined {
	return pageSections(page).find((section) => section.blockIds.includes(blockId));
}

function sectionCanvasHost(page: PageConfig, blockId: string): PageBlock | undefined {
	const section = blockSection(page, blockId);
	if (!section) return undefined;
	const byId = new Map((page.blocks ?? []).map((block) => [block.id, block]));
	for (const id of section.blockIds) {
		const block = byId.get(id);
		if (block?.type === 'gallery' && page.gallery?.layout !== 'grid') return block;
		if (
			block?.type === 'images' &&
			block.gallery.carousel !== true &&
			block.gallery.layout !== 'grid'
		)
			return block;
	}
	return undefined;
}

function sectionCanvasBottom(doc: EditorDoc, page: PageConfig, sectionId: string): number {
	const section = pageSections(page).find((candidate) => candidate.id === sectionId);
	if (!section) return 0;
	const byId = new Map((page.blocks ?? []).map((block) => [block.id, block]));
	const host = section.blockIds
		.map((id) => byId.get(id))
		.find(
			(block) =>
				(block?.type === 'gallery' && page.gallery?.layout !== 'grid') ||
				(block?.type === 'images' &&
					block.gallery.carousel !== true &&
					block.gallery.layout !== 'grid'),
		);
	const config =
		host?.type === 'gallery'
			? page.gallery
			: host?.type === 'images'
				? host.gallery
				: undefined;
	let bottom = 0;
	if (config) {
		const entries = doc.galleries[config.folder] ?? [];
		const flowed = flowMissing(
			entries.map((entry) => ({
				layout: entry.meta.layout,
				ar: entry.meta.layout?.ar ?? DEFAULT_AR,
			})),
		);
		const layouts = entries.flatMap((entry, index) => {
			const layout = entry.meta.layout ?? flowed.get(index);
			return layout ? [layout] : [];
		});
		bottom = Math.max(bottom, canvasHeight(layouts));
	}
	for (const id of section.blockIds) {
		const block = byId.get(id);
		if (block?.type === 'text' && block.layout)
			bottom = Math.max(bottom, textBottom(block.layout));
		if (block?.type === 'embed' && block.layout)
			bottom = Math.max(bottom, bottomOf(block.layout));
		if (block?.type === 'images' && block.gallery.carouselFrame)
			bottom = Math.max(bottom, bottomOf(block.gallery.carouselFrame));
		if (block?.type === 'divider' && block.layout)
			bottom = Math.max(bottom, bottomOf(block.layout));
		if (block?.type === 'children')
			for (const item of block.items ?? [])
				if (item.layout) bottom = Math.max(bottom, bottomOf(item.layout));
		if (block?.type === 'project' && block.layout)
			bottom = Math.max(bottom, bottomOf(block.layout));
		if (block?.type === 'form' && block.layout)
			bottom = Math.max(bottom, bottomOf(block.layout));
		if (
			(block?.type === 'children' || block?.type === 'products') &&
			block.canvasLayout
		)
			bottom = Math.max(bottom, bottomOf(block.canvasLayout));
	}
	return bottom;
}

/** Page keys that can never be minted for a new page (routes/folders the site owns). */
const RESERVED_KEYS = new Set(['home', 'editor', 'demo', 'thumbs', '404']);
const SUPPORTED_CURRENCY_CODES =
	typeof Intl.supportedValuesOf === 'function'
		? new Set(Intl.supportedValuesOf('currency'))
		: null;

/** How many full-document states Cmd+Z can walk back through. */
const HISTORY_LIMIT = 100;

export type SaveStatus = 'saving' | 'saved' | 'failed';

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'page'
	);
}

/** A page key that collides with nothing: not reserved, not an existing page. */
export function uniquePageKey(desired: string, pages: Record<string, PageConfig>): string {
	let key = desired;
	for (let n = 2; RESERVED_KEYS.has(key) || key in pages; n++) key = `${desired}-${n}`;
	return key;
}

/** A gallery folder that collides with nothing the document already uses. */
function uniqueFolder(desired: string, doc: EditorDoc): string {
	// These src/assets/ subfolders are owned by non-gallery export features.
	const taken = new Set(['fonts', 'thumbs', 'products', ...Object.keys(doc.content.galleries), ...Object.keys(doc.galleries)]);
	for (const page of Object.values(doc.content.pages))
		for (const config of pageGalleryConfigs(page)) taken.add(config.folder);
	let folder = desired;
	for (let n = 2; taken.has(folder); n++) folder = `${desired}-${n}`;
	return folder;
}

/** The one workbench folder every artist has: what lands here fills the home
 * page when pages are built. The workbench UI pins it and offers no rename or
 * delete for it. */
export const SELECTED_WORKS_FOLDER = 'Selected works';

/** Pure core of addPage: the next document plus the new page's key. */
function withGalleryPage(
	prev: EditorDoc,
	label: string,
	projectTemplate?: ProjectTemplate,
	options?: { hidden?: boolean },
): { doc: EditorDoc; key: string } {
	const key = uniquePageKey(slugify(label), prev.content.pages);
	const folder = uniqueFolder(key, prev);
	const name = label.trim() || 'New page';
	const page: PageConfig = {
		title: `${name} — {name}`,
		label: name,
		heading: projectTemplate ? name : undefined,
		gallery: { folder, alt: name, order: 'asc' },
		blocks: [
			...(projectTemplate ? [{ id: uid('project'), type: 'project' as const, project: { template: projectTemplate } }] : []),
			{ id: 'gallery', type: 'gallery' as const },
		],
		sections: [],
	};
	page.sections = [{ id: MAIN_SECTION_ID, name: 'Main section', blockIds: (page.blocks ?? []).map((block) => block.id) }];
	return {
		doc: {
			...prev,
			content: {
				...prev.content,
				nav: [...prev.content.nav, { path: key, label: name, ...(options?.hidden ? { hidden: true } : {}) }],
				pages: { ...prev.content.pages, [key]: page },
				galleries: { ...prev.content.galleries, [folder]: { items: {} } },
			},
			galleries: { ...prev.galleries, [folder]: [] },
		},
		key,
	};
}

/** Clone an image entry for another image group: fresh id, workbench folder
 * assignment dropped (unless the copy stays in the workbench), crop, light,
 * and layout kept. */
function cloneEntryForGroup(source: ImageEntry, keepWorkbenchFolder = false): ImageEntry {
	return {
		...source,
		id: uid('e'),
		meta: {
			...source.meta,
			workbenchFolder: keepWorkbenchFolder ? source.meta.workbenchFolder : undefined,
			layout: source.meta.layout ? { ...source.meta.layout } : undefined,
			effects: source.meta.effects ? { ...source.meta.effects } : undefined,
		},
	};
}

/** The image group that "fills" a page: its main gallery, else its first images block. */
function pageMainImageFolder(page: PageConfig): string | null {
	if (page.gallery) return page.gallery.folder;
	const imagesBlock = (page.blocks ?? []).find(
		(block): block is Extract<PageBlock, { type: 'images' }> => block.type === 'images',
	);
	return imagesBlock ? imagesBlock.gallery.folder : null;
}

function pageDisplayLabel(page: PageConfig, key: string): string {
	return page.label || (key === 'home' ? 'Home' : key);
}

/** The page a workbench folder name refers to: label match first, slug second. */
function pageKeyForFolderName(pages: Record<string, PageConfig>, folderName: string): string | null {
	const wanted = folderName.trim().toLowerCase();
	for (const [key, page] of Object.entries(pages))
		if ((page.label ?? '').trim().toLowerCase() === wanted) return key;
	const slug = slugify(folderName);
	return pages[slug] ? slug : null;
}

function sampleEntryFor(sampleAssetId: string): ImageEntry | null {
	const artwork = getSampleArtwork(sampleAssetId);
	if (!artwork) return null;
	return {
		id: uid('e'),
		filename: artwork.url.slice(artwork.url.lastIndexOf('/') + 1),
		meta: { title: artwork.title, alt: artwork.alt, description: '', link: '' },
		assetId: null,
		sampleAssetId,
	};
}

export interface WorkbenchBuildReport {
	/** Folders whose photos were hung on a page this run. */
	built: Array<{ folder: string; pageKey: string; pageLabel: string; count: number }>;
	/** Folders left alone because their page already holds the artist's own images. */
	skipped: Array<{ folder: string; pageKey: string; pageLabel: string }>;
	/** Pages dressed with rights-cleared samples (the zero-photo head start). */
	sampled: Array<{ pageKey: string; pageLabel: string; count: number }>;
	/** Pages created because no existing page matched the folder name. */
	createdPages: string[];
}

const SAMPLE_FILL_COUNT = 4;

/** The one-time "OK — build my pages" event. Pure: each workbench folder is
 * matched to a page by name (created when no page matches), its photos are
 * COPIED into that page's image group, and Selected works fills the home page.
 * A workbench with no photos at all instead dresses empty matched pages with
 * rights-cleared samples for the artist's discipline. Nothing records the
 * folder→page link afterward — pages already holding the artist's own images
 * are reported and left untouched, which is also what makes a second run a
 * no-op. Starter samples in a target group give way to the artist's photos. */
export function buildWorkbenchPages(
	prev: EditorDoc,
	sampleStarterId?: string | null,
): { doc: EditorDoc; report: WorkbenchBuildReport } {
	const report: WorkbenchBuildReport = { built: [], skipped: [], sampled: [], createdPages: [] };
	const entries = prev.galleries[WORKBENCH_FOLDER] ?? [];
	const folderNames = [
		...new Set(
			[
				SELECTED_WORKS_FOLDER,
				...(prev.workbenchFolders ?? []),
				...entries.map((entry) => entry.meta.workbenchFolder?.trim()),
			].filter((value): value is string => !!value),
		),
	];
	const photosByFolder = new Map<string, ImageEntry[]>();
	for (const entry of entries) {
		const name = entry.meta.workbenchFolder?.trim();
		if (!name) continue;
		photosByFolder.set(name, [...(photosByFolder.get(name) ?? []), entry]);
	}
	const sampleMode = entries.length === 0;
	const samplePool = sampleMode ? starterSampleFallbackIds(sampleStarterId) : [];
	let sampleCursor = 0;

	let doc = prev;
	for (const folder of folderNames) {
		const isSelectedWorks = folder === SELECTED_WORKS_FOLDER;
		// The zero-photo head start keeps the "a page for each series" promise;
		// it never hangs placeholder art on the home page.
		if (sampleMode && isSelectedWorks) continue;
		let pageKey = isSelectedWorks ? 'home' : pageKeyForFolderName(doc.content.pages, folder);
		if (!pageKey) {
			const created = withGalleryPage(doc, folder);
			doc = created.doc;
			pageKey = created.key;
			report.createdPages.push(pageKey);
		}
		const page = doc.content.pages[pageKey];
		if (!page) continue;
		const pageLabel = pageDisplayLabel(page, pageKey);
		const targetFolder = pageMainImageFolder(page);
		const photos = photosByFolder.get(folder) ?? [];
		if (!targetFolder) {
			if (photos.length) report.skipped.push({ folder, pageKey, pageLabel });
			continue;
		}
		const existing = doc.galleries[targetFolder] ?? [];

		if (sampleMode) {
			if (existing.length || !samplePool.length) continue;
			const fills: ImageEntry[] = [];
			for (let index = 0; index < SAMPLE_FILL_COUNT; index += 1) {
				const entry = sampleEntryFor(samplePool[sampleCursor % samplePool.length]);
				sampleCursor += 1;
				if (entry) fills.push(entry);
			}
			if (!fills.length) continue;
			doc = { ...doc, galleries: { ...doc.galleries, [targetFolder]: fills } };
			report.sampled.push({ pageKey, pageLabel, count: fills.length });
			continue;
		}

		if (!photos.length) continue; // an empty folder builds an empty page — now it exists
		if (existing.some((entry) => entry.assetId !== null)) {
			report.skipped.push({ folder, pageKey, pageLabel });
			continue;
		}
		const copies = photos.map((entry) => cloneEntryForGroup(entry));
		doc = { ...doc, galleries: { ...doc.galleries, [targetFolder]: copies } };
		report.built.push({ folder, pageKey, pageLabel, count: copies.length });
	}
	return { doc, report };
}

/** How a template re-hang went, for the picker's confirmation line. */
export interface TemplateApplyReport {
	/** The artist's own works re-hung into the template's image positions. */
	rehung: number;
	/** Works beyond the template's positions, appended after the last position. */
	overflow: number;
	/** Template sample frames still showing (fewer works than positions). */
	samplesLeft: number;
}

/** Applying a landing-page template (BACKLOG spec 11). Pure: the home page and
 * site theme become the template's; every other page, the artist's identity
 * (name, bio, contact, socials, résumé, store), and their uploaded files stay.
 * The artist's works — their own uploads hanging on the current home page, in
 * wall order — replace the template's sample slots in order, each adopting its
 * slot's canvas position; overflow appends after the last image group's slots
 * so a later template switch re-collects the works in the same order. Samples
 * never count as works, which is what makes re-applying duplicate nothing. */
export function applyTemplateToDoc(
	prev: EditorDoc,
	template: Content,
): { doc: EditorDoc; report: TemplateApplyReport } {
	const report: TemplateApplyReport = { rehung: 0, overflow: 0, samplesLeft: 0 };
	const templateDoc = initDocFromContent(template);
	const templateHome = templateDoc.content.pages.home;
	if (!templateHome) return { doc: prev, report };

	const prevHome = prev.content.pages.home;
	const works: ImageEntry[] = [];
	const prevHomeFolders = prevHome
		? [...new Set(pageGalleryConfigs(prevHome).map((config) => config.folder))]
		: [];
	for (const folder of prevHomeFolders)
		for (const entry of prev.galleries[folder] ?? [])
			if (entry.assetId !== null) works.push(entry);

	// A template home with nowhere to hang images would swallow the works — the
	// catalog validator forbids shipping one, and this guard refuses stray data.
	const homeConfigs = pageGalleryConfigs(templateHome);
	if (!homeConfigs.length && works.length) return { doc: prev, report };

	// Folders the rest of the site keeps using. Template folders that collide
	// with them are renamed; old-home folders nothing else references drop out.
	const survivingPages = Object.fromEntries(
		Object.entries(prev.content.pages).filter(([key]) => key !== 'home'),
	);
	const keptFolders = new Set<string>([WORKBENCH_FOLDER]);
	for (const page of Object.values(survivingPages))
		for (const config of pageGalleryConfigs(page)) keptFolders.add(config.folder);
	for (const saved of prev.content.sectionLibrary ?? [])
		if (saved.block.type === 'images') keptFolders.add(saved.block.gallery.folder);

	const renames = new Map<string, string>();
	const taken = new Set(keptFolders);
	for (const config of homeConfigs) {
		let name = config.folder;
		for (let n = 2; taken.has(name); n += 1) name = `${config.folder}-${n}`;
		if (name !== config.folder) renames.set(config.folder, name);
		taken.add(name);
	}
	const renamed = (folder: string) => renames.get(folder) ?? folder;
	const newHome: PageConfig = {
		...templateHome,
		...(templateHome.gallery
			? { gallery: { ...templateHome.gallery, folder: renamed(templateHome.gallery.folder) } }
			: {}),
		blocks: (templateHome.blocks ?? []).map((block) =>
			block.type === 'images'
				? { ...block, gallery: { ...block.gallery, folder: renamed(block.gallery.folder) } }
				: block,
		),
	};

	// Walk the template's slots in document order, hanging the artist's next
	// work into each: the work keeps its own image, crop, light, and captions,
	// and adopts the slot's layout — the template dictates positions.
	const queue = [...works];
	const newGalleries: Record<string, ImageEntry[]> = {};
	const hungIds = new Map<string, string>(); // template slot id → hung work id
	for (const config of homeConfigs) {
		const target = renamed(config.folder);
		if (newGalleries[target]) continue; // two blocks sharing a folder hang it once
		newGalleries[target] = (templateDoc.galleries[config.folder] ?? []).map((slot) => {
			if (!slot.sampleAssetId || !queue.length) {
				if (slot.sampleAssetId) report.samplesLeft += 1;
				return slot;
			}
			const hung = cloneEntryForGroup(queue.shift()!);
			hung.meta.layout = slot.meta.layout ? { ...slot.meta.layout } : undefined;
			hungIds.set(slot.id, hung.id);
			report.rehung += 1;
			return hung;
		});
	}
	if (queue.length) {
		const lastFolder = renamed(homeConfigs[homeConfigs.length - 1].folder);
		for (const work of queue) {
			const hung = cloneEntryForGroup(work);
			hung.meta.layout = undefined; // freeform canvases auto-flow unplaced images
			newGalleries[lastFolder] = [...(newGalleries[lastFolder] ?? []), hung];
			report.overflow += 1;
		}
	}

	// The template's phone arrangement pins slot ids; hung works carry fresh
	// ids, so the arrangement must follow them or the draft fails validation
	// on its next load.
	const remapMobileKey = (key: string) => {
		const slotId = key.startsWith('image:') ? hungIds.get(key.slice('image:'.length)) : undefined;
		return slotId ? `image:${slotId}` : key;
	};
	const remapMobile = (config: GalleryConfig): GalleryConfig =>
		config.mobile
			? {
					...config,
					mobile: {
						...config.mobile,
						order: config.mobile.order.map(remapMobileKey),
						items: config.mobile.items
							? Object.fromEntries(
									Object.entries(config.mobile.items).map(([key, style]) => [remapMobileKey(key), style]),
								)
							: config.mobile.items,
					},
				}
			: config;
	if (hungIds.size) {
		if (newHome.gallery) newHome.gallery = remapMobile(newHome.gallery);
		newHome.blocks = (newHome.blocks ?? []).map((block) =>
			block.type === 'images' ? { ...block, gallery: remapMobile(block.gallery) } : block,
		);
	}

	const galleries: Record<string, ImageEntry[]> = {};
	for (const [folder, entries] of Object.entries(prev.galleries))
		if (keptFolders.has(folder)) galleries[folder] = entries;
	Object.assign(galleries, newGalleries);
	const contentGalleries: Content['galleries'] = {};
	for (const [folder, gallery] of Object.entries(prev.content.galleries))
		if (keptFolders.has(folder)) contentGalleries[folder] = gallery;
	for (const config of homeConfigs)
		contentGalleries[renamed(config.folder)] =
			templateDoc.content.galleries[config.folder] ?? { items: {} };

	// contentWithThemePreset keeps the artist's custom fonts attached and lets
	// the template's motion vocabulary win only when it declares one.
	const content = contentWithThemePreset(
		{
			...prev.content,
			pages: { ...survivingPages, home: newHome },
			galleries: contentGalleries,
		},
		templateDoc.content.theme,
	);

	const pageThumbs = { ...prev.pageThumbs };
	delete pageThumbs.home;
	if (templateDoc.pageThumbs.home) pageThumbs.home = templateDoc.pageThumbs.home;
	const ogImage =
		prev.ogImage &&
		galleries[prev.ogImage.folder]?.some((entry) => entry.id === prev.ogImage?.entryId)
			? prev.ogImage
			: undefined;

	return { doc: { ...prev, content, galleries, pageThumbs, ogImage }, report };
}

function pageTreeKeys(pages: Record<string, PageConfig>, root: string): Set<string> {
	const found = new Set<string>();
	const queue = [root];
	while (queue.length) {
		const key = queue.shift()!;
		if (found.has(key) || !pages[key]) continue;
		found.add(key);
		queue.push(...(pages[key].children ?? []));
	}
	return found;
}

function referencedGalleryFolders(
	pages: Record<string, PageConfig>,
	sectionLibrary: SavedSectionTemplate[] = [],
): Set<string> {
	const folders = Object.values(pages).flatMap((page) =>
		pageGalleryConfigs(page).map((gallery) => gallery.folder),
	);
	for (const saved of sectionLibrary) {
		if (saved.block.type === 'images') folders.push(saved.block.gallery.folder);
	}
	return new Set(folders);
}

function cloneReusableBlock(block: PageBlock): PageBlock {
	const cloned = JSON.parse(JSON.stringify(block)) as PageBlock;
	const id = uid(block.type);
	if (cloned.type === 'form') {
		return {
			...cloned,
			id,
			fields: cloned.fields.map((field) => ({ ...field, id: uid('field') })),
		};
	}
	return { ...cloned, id } as PageBlock;
}

function referencedAssetIds(doc: EditorDoc): Set<string> {
	const ids = new Set<string>();
	for (const entries of Object.values(doc.galleries))
		for (const entry of entries) if (entry.assetId) ids.add(entry.assetId);
	for (const page of Object.values(doc.content.pages))
		for (const block of page.blocks ?? [])
			if (block.type === 'shots' && block.assetId) ids.add(block.assetId);
	for (const template of doc.content.sectionLibrary ?? [])
		if (template.block.type === 'shots' && template.block.assetId)
			ids.add(template.block.assetId);
	for (const slot of [
		doc.profileImage,
		doc.logoImage,
		doc.signatureImage,
		doc.cursorImage,
		doc.resumeFile,
		...Object.values(doc.pageThumbs),
		...Object.values(doc.productImages),
		...Object.values(doc.fonts),
	])
		if (slot?.assetId) ids.add(slot.assetId);
	return ids;
}

function withoutPhoneItem(config: GalleryConfig, itemKey: string): GalleryConfig {
	if (!config.mobile) return config;
	const order = config.mobile.order.filter((key) => key !== itemKey);
	const items = { ...config.mobile.items };
	delete items[itemKey];
	return {
		...config,
		mobile: { ...config.mobile, order, items: Object.keys(items).length ? items : undefined },
	};
}

function withoutPhonePageBlocks(
	mobile: MobileComposition | undefined,
	blockIds: readonly string[],
): MobileComposition | undefined {
	if (!mobile || blockIds.length === 0) return mobile;
	const removed = new Set(blockIds.map((id) => `block:${id}`));
	const items = Object.fromEntries(Object.entries(mobile.items ?? {}).filter(([key]) => !removed.has(key)));
	return {
		...mobile,
		order: mobile.order.filter((key) => !removed.has(key)),
		items: Object.keys(items).length ? items : undefined,
	};
}

function pageHasCanvas(page: PageConfig, blockId?: string): boolean {
	if (blockId) return !!sectionCanvasHost(page, blockId);
	return (page.blocks ?? []).some((block) => !!sectionCanvasHost(page, block.id));
}

/** "my-font_bold.woff2" -> "My Font Bold" — a readable, CSS-safe font-family name. */
function fontNameFromFile(filename: string): string {
	const base = filename.replace(/\.[^.]+$/, '');
	const words = base
		.replace(/["\\]/g, '')
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
	return words.join(' ') || 'Custom Font';
}

export interface EditorContextValue {
	doc: EditorDoc | null;
	hasDraft: boolean;
	draftError: string | null;
	/** Current browser-draft autosave state. */
	saveStatus: SaveStatus;
	/** Plain-language detail for a failed autosave. */
	saveError: string | null;
	// lifecycle
	startBlank(): void;
	startExisting(): void;
	/** Start a fresh document from one of the bundled site templates. */
	startTemplate(content: Content): void;
	resumeDraft(): Promise<void>;
	/** Open a fully-formed document (e.g. one loaded from GitHub, assets already registered). */
	openDoc(doc: EditorDoc): Promise<void>;
	reset(): Promise<void>;
	// profile / contact
	setName(value: string): void;
	setProfileName(value: string): void;
	/** Choose whether the site header shows the site name, custom text, or an uploaded image. */
	setHeaderMode(value: HeaderMode): void;
	/** Optional header text; empty falls back to the site name. */
	setLogoText(value: string): void;
	setBio(value: string, richText?: RichTextParagraph[]): void;
	setProfileBioFont(value: string | undefined): void;
	setEmail(value: string): void;
	setProfileImage(file: File): void;
	removeProfileImage(): void;
	setProfileImagePresentation(
		patch: Partial<Pick<Content['profile'], 'imageWidth' | 'imageAspect' | 'imageFocusX' | 'imageFocusY' | 'imageCropZoom' | 'imageLayout' | 'contentLayout'>>,
	): void;
	/** Upload a header logo image (replaces the text logo on every page). */
	setLogoImage(file: File): void;
	removeLogoImage(): void;
	/** Upload the résumé PDF linked from the About section. */
	setResumeFile(file: File): void;
	/** Remove the résumé entirely (no link shown on the site). */
	removeResume(): void;
	/** Rename the résumé link ("Résumé" by default; empty hides the link). */
	setResumeLabel(value: string): void;
	// theme
	setTheme(patch: Partial<Theme>): void;
	/** Replace factory theme tokens while preserving the document's uploaded font files. */
	applyThemePreset(theme: Theme): void;
	/** Re-hang the site onto a landing-page template: home page + theme swap,
	 * the artist's works re-flowed into the template's positions. One undo. */
	applyTemplate(template: Content): TemplateApplyReport | null;
	/** Register an uploaded font file and select it as the site font. */
	addCustomFont(file: File): void;
	removeCustomFont(name: string): void;
	// social
	addSocial(): void;
	updateSocial(index: number, patch: Partial<SocialLink>): void;
	removeSocial(index: number): void;
	moveSocial(from: number, to: number): void;
	// store
	/** Initialize a USD catalog and add a visible, collision-safe Shop page.
	 *  Returns the new Shop page's key so callers can reveal it. */
	setupStore(): string | undefined;
	setStoreCurrency(currency: string): void;
	addProduct(): void;
	updateProduct(
		productId: string,
		patch: Partial<Omit<StoreProduct, 'id' | 'offers' | 'image'>>,
	): void;
	removeProduct(productId: string): void;
	moveProduct(from: number, to: number): void;
	setProductImage(productId: string, file: File): void;
	/** Reuse one gallery artwork by sharing its browser asset id. */
	setProductImageFromGallery(productId: string, folder: string, entryId: string): void;
	removeProductImage(productId: string): void;
	addProductOffer(productId: string): void;
	updateProductOffer(
		productId: string,
		offerId: string,
		patch: Partial<Omit<StoreOffer, 'id'>>,
	): void;
	removeProductOffer(productId: string, offerId: string): void;
	moveProductOffer(productId: string, from: number, to: number): void;
	// pages
	addPage(label: string, projectTemplate?: ProjectTemplate, options?: { hidden?: boolean }): void;
	addChildPage(parentKey: string, label: string, sectionId?: string): void;
	removePage(key: string): void;
	movePage(from: number, to: number): void;
	/** Make a copy of a top-level page, including its blocks and image groups. */
	duplicatePage(key: string): void;
	/** Keep a page published while showing or hiding it in the menu. */
	setPageMenuVisibility(key: string, visible: boolean): void;
	/** Keep a page in the editor but leave it out of the next publish. */
	setPageDraft(key: string, draft: boolean): void;
	/** Publish a page while asking search engines not to list it. */
	setPageNoindex(key: string, noindex: boolean): void;
	/** Browser-tab/search title. */
	setPageTitle(key: string, title: string): void;
	/** Optional phone-only order/visibility for the page's sections. */
	setPageMobile(key: string, mobile: MobileComposition | undefined): void;
	/** Change the top-level page's address segment. */
	changePagePath(key: string, requestedPath: string): void;
	/** Reorder a page's sub-pages (changes their card order on the site too). */
	moveChildPage(parentKey: string, from: number, to: number): void;
	renamePage(key: string, label: string): void;
	setPageHeading(key: string, heading: string): void;
	/** Override site-wide hanging for this page; undefined inherits the site choice. */
	setPageHanging(key: string, hanging: boolean | undefined): void;
	/** Set the page-only hanging angle; undefined inherits the site strength. */
	setPageHangingStrength(key: string, strength: number | undefined): void;
	setHeadingKinetic(key: string, kinetic: KineticTextConfig | undefined): void;
	setProjectDetails(key: string, project: ProjectDetails | undefined): void;
	setPageThumb(key: string, file: File): void;
	removePageThumb(key: string): void;
	// page blocks
	addTextBlock(key: string, sectionId?: string): void;
	updateTextBlock(key: string, blockId: string, text: string): void;
	updateRichTextBlock(
		key: string,
		blockId: string,
		text: string,
		richText: RichTextParagraph[],
	): void;
	setTextFont(key: string, blockId: string, fontFamily: string | undefined): void;
	setTextBackground(key: string, blockId: string, background: string | undefined): void;
	setTextAlign(key: string, blockId: string, align: TextAlign): void;
	setTextStyle(key: string, blockId: string, style: TextStyle): void;
	setTextLink(key: string, blockId: string, link: string): void;
	setTextKinetic(key: string, blockId: string, kinetic: KineticTextConfig | undefined): void;
	/** Set normal-flow text width and horizontal position. */
	setTextFlowLayout(key: string, blockId: string, layout: TextFlowLayout | undefined): void;
	/** Pin a text block to the page canvas (or undefined to return it to the flow). */
	setTextLayout(key: string, blockId: string, layout: TextLayout | undefined): void;
	/** Change gallery display settings (freeform/grid, columns, crop aspect, smart grid, gaps).
	 * An actionKey coalesces rapid same-control commits (slider drags, typing) into one undo entry. */
	setGalleryConfig(
		key: string,
		patch: Partial<
			Pick<GalleryConfig, 'layout' | 'columns' | 'aspect' | 'smartGrid' | 'galleryWall' | 'gapX' | 'gapY' | 'mobile'>
		>,
		actionKey?: string,
	): void;
	/** Ensure the page has a primary freeform image group, optionally inserting it before a block. */
	addFreeformGallery(key: string, beforeBlockId?: string, sectionId?: string): void;
	/** Add an extra image group (its own folder + canvas/grid) to the page. */
	addImagesBlock(key: string, sectionId?: string): void;
	/** Change an image group's display settings, including its optional carousel presentation. */
	updateImagesBlock(
		key: string,
		blockId: string,
		patch: Partial<
			Pick<
				GalleryConfig,
				| 'layout'
				| 'columns'
				| 'aspect'
				| 'smartGrid'
				| 'galleryWall'
				| 'gapX'
				| 'gapY'
				| 'carousel'
				| 'carouselFit'
				| 'carouselFrame'
				| 'carouselFreeResize'
				| 'carouselCustomRatio'
				| 'carouselMoveImage'
				| 'carouselHost'
				| 'carouselShowCount'
				| 'carouselShowTitle'
				| 'carouselRequireAlt'
				| 'carouselArrowStyle'
				| 'carouselFrameStyle'
				| 'carouselChromeColor'
				| 'carouselArrowColor'
				| 'mobile'
			>
		>,
		actionKey?: string,
	): void;
	/** Give an image group a display name (shown in the editor so groups are tellable apart). */
	renameImagesBlock(key: string, blockId: string, name: string): void;
	/** Choose how a page's sub-pages are presented (cards, big covers, list, text index). */
	setChildrenStyle(key: string, blockId: string, style: ChildrenStyle): void;
	updateChildrenBlock(
		key: string,
		blockId: string,
		patch: Partial<Pick<Extract<PageBlock, { type: 'children' }>, 'items' | 'style' | 'canvasLayout'>>,
	): void;
	/** Rename one sub-page card — used by editing the label in the preview. */
	renameChildCard(key: string, blockId: string, itemId: string, label: string): void;
	/** Place a sub-page or product collection on its section canvas, or return it to flow. */
	setWidgetLayout(key: string, blockId: string, layout: ImageLayout | undefined): void;
	/** Store the hand-drawn signature (undefined clears it off the site). */
	setSignature(data: SignatureData | undefined): void;
	setSignatureImage(file: File): void;
	removeSignatureImage(): void;
	/** Footer text shown at the bottom of every page (empty removes the footer). */
	setFooter(value: string): void;
	setFooterName(value: string): void;
	setFooterNameSize(value: number | undefined): void;
	setFooterColumns(columns: FooterColumn[] | undefined): void;
	setFooterImage(file: File): void;
	removeFooterImage(): void;
	setFooterImageLayout(layout: ImageLayout | undefined): void;
	addEmbedBlock(key: string, kind?: EmbedKind, sectionId?: string): void;
	updateEmbedBlock(key: string, blockId: string, url: string): void;
	/** Resize and position a hosted player or map while it stays in page flow. */
	setEmbedFlowLayout(key: string, blockId: string, layout: TextFlowLayout | undefined): void;
	/** Pin a hosted player or map to the page canvas (or undefined to return it to the flow). */
	setEmbedLayout(key: string, blockId: string, layout: ImageLayout | undefined): void;
	addShotsBlock(key: string, sectionId?: string): void;
	setShotsFile(key: string, blockId: string, file: File): void;
	updateShotsBlock(
		key: string,
		blockId: string,
		patch: Partial<
			Pick<
				Extract<PageBlock, { type: 'shots' }>,
				'src' | 'scrollLength' | 'fadeIntoPage' | 'fadeStart' | 'fadeDuration' | 'fit' | 'phone'
			>
		>,
	): void;
	addButtonBlock(key: string, sectionId?: string): void;
	updateButtonBlock(
		key: string,
		blockId: string,
		patch: Partial<{ label: string; url: string; align: TextAlign; appearance: 'solid' | 'outline' }>,
	): void;
	addDividerBlock(key: string, sectionId?: string): void;
	updateDividerBlock(
		key: string,
		blockId: string,
		patch: Partial<Extract<PageBlock, { type: 'divider' }>>,
	): void;
	/** Add the shared About content to a page; no-op when that page already has it. */
	addAboutBlock(key: string, sectionId?: string): void;
	addContactBlock(key: string, sectionId?: string): void;
	updateContactBlock(
		key: string,
		blockId: string,
		patch: Partial<Omit<Extract<PageBlock, { type: 'contact' }>, 'id' | 'type'>>,
	): void;
	addFormBlock(key: string, sectionId?: string): void;
	updateFormBlock(
		key: string,
		blockId: string,
		patch: Partial<Extract<PageBlock, { type: 'form' }>>,
	): void;
	/** Shapes are born freeform: placed on the section canvas at add time. */
	addShapeBlock(key: string, shape: 'line' | 'arrow' | 'rectangle', sectionId?: string): void;
	updateShapeBlock(
		key: string,
		blockId: string,
		patch: Partial<Omit<Extract<PageBlock, { type: 'shape' }>, 'id' | 'type'>>,
	): void;
	addAccordionBlock(key: string, sectionId?: string): void;
	updateAccordionBlock(
		key: string,
		blockId: string,
		patch: Partial<Omit<Extract<PageBlock, { type: 'accordion' }>, 'id' | 'type'>>,
	): void;
	addProductsBlock(key: string, sectionId?: string): void;
	updateProductsBlock(
		key: string,
		blockId: string,
		patch: Partial<Pick<Extract<PageBlock, { type: 'products' }>, 'productIds' | 'layout'>>,
	): void;
	addProjectBlock(key: string, sectionId?: string): void;
	updateProjectBlock(
		key: string,
		blockId: string,
		patch: Partial<Omit<Extract<PageBlock, { type: 'project' }>, 'id' | 'type'>>,
	): void;
	removeBlock(key: string, blockId: string): void;
	/** Copy a block right after itself — image blocks get their own copied
	 * gallery folder so the two evolve independently. About, sub-page, and the
	 * legacy main-gallery blocks are not duplicable. */
	duplicateBlock(key: string, blockId: string): void;
	/** Remove a whole section: its blocks, per-section styling, and any image
	 * folders nothing else references. Refused for the page's only section. */
	removeSection(key: string, sectionId: string): void;
	/** Replace a block's module type while keeping its place in the page and section. */
	changeBlockType(key: string, blockId: string, type: PageBlock['type']): void;
	moveBlock(key: string, from: number, to: number): void;
	/** Reorder a block inside its current section. */
	moveBlockInSection(key: string, sectionId: string, from: number, to: number): void;
	/** Move a whole section, preserving every block inside it. */
	moveSection(key: string, from: number, to: number): void;
	renameSection(key: string, sectionId: string, name: string): void;
	setSectionEditorColor(key: string, sectionId: string, color: string | undefined): void;
	/** Toggle a block between a dedicated section and the main section. */
	toggleBlockSection(key: string, blockId: string): void;
	/** Move a block to an existing section, appending it at that section's bottom. */
	moveBlockToSection(key: string, blockId: string, sectionId: string): void;
	/** Save a reusable block; legacy section styling is retained for new-section recall. */
	saveSectionTemplate(key: string, blockId: string, name: string): void;
	insertSectionTemplate(key: string, templateId: string, sectionId?: string): void;
	removeSectionTemplate(templateId: string): void;
	// galleries
	addGalleryImages(
		folder: string,
		images: Array<{
			file: File;
			alt: string;
			decorative?: true;
			workbenchFolder?: string;
		}>,
	): void;
	/** Create a persistent workbench folder, even when it has no photos. */
	createWorkbenchFolder(name: string): void;
	/** The one-time "OK — build my pages" event: hang each workbench folder's
	 * photos on its matching page (Selected works → home). One undo entry.
	 * Returns what was built, skipped, or sample-dressed; null with no document. */
	buildPagesFromWorkbench(sampleStarterId?: string | null): WorkbenchBuildReport | null;
	/** Copy or move an existing image between the workbench and any image group. */
	transferGalleryImage(
		sourceFolder: string,
		entryId: string,
		targetFolder: string,
		move?: boolean,
	): void;
	/** Swap an uploaded image while preserving its caption, placement and stable id. */
	replaceGalleryImage(
		folder: string,
		id: string,
		image: { file: File; alt: string; decorative?: true },
	): void;
	/** Opt in to a catalog-provided successor for withdrawn sample artwork. */
	replaceSampleWithSuccessor(folder: string, id: string): void;
	removeGalleryImage(folder: string, id: string): void;
	moveGalleryImage(folder: string, from: number, to: number): void;
	updateGalleryMeta(folder: string, id: string, patch: Partial<ImageMeta>): void;
	/** Randomly reorder a whole image group. One undo step restores the old order. */
	shuffleGalleryImages(folder: string): void;
	/** Reset every image's artwork effects (hanging/mount/hover/arrival) and crop
	 *  overrides to the page defaults. One undo step; callers confirm first. */
	clearGalleryImageSettings(folder: string): void;
	/** Remove every image's crop/zoom/focus override in one undo step. */
	resetGalleryCrops(folder: string): void;
	/** Give every image in the group the same crop frame and zoom (one undo step);
	 *  individual images can still be nudged afterwards. */
	applyGalleryCropAll(folder: string, aspect: string | undefined, zoom: number): void;
	/** Overwrite many images' freeform positions at once (id -> layout), e.g. when
	 *  adopting the Grid arrangement as the freeform starting point. */
	setGalleryLayouts(folder: string, layouts: Record<string, ImageLayout>): void;
	/** Commit a mixed image/text/video canvas move as one undoable document change. */
	applyCanvasLayouts(
		pageKey: string,
		folder: string,
		updates: {
			images?: Record<string, ImageLayout>;
			texts?: Record<string, TextLayout>;
			embeds?: Record<string, ImageLayout>;
			widgets?: Record<string, ImageLayout>;
		},
	): void;
	/** Delete the selected freeform items as one undoable edit. */
	deleteCanvasItems(pageKey: string, folder: string, selection: CanvasSelection): void;
	// creative extras
	/** Optional site-wide flourishes configured in the Design area. */
	setCreative(patch: Partial<CreativeConfig>): void;
	/** Upload or replace the image that follows the visitor's pointer. */
	setCursorImage(file: File): void;
	removeCursorImage(): void;
	// color blocking
	/** Whole-page background color (undefined = the site background). */
	setPageBackground(key: string, color: string | undefined): void;
	/** Background color of one page section, keyed 'block:<id>' / 'page:heading'. */
	setSectionColor(key: string, partKey: string, color: string | undefined): void;
	/** Full bleed for one page section: its freeform canvas spans the viewport. */
	setSectionBleed(key: string, partKey: string, bleed: boolean): void;
	setSectionFade(key: string, partKey: string, fade: 'fade' | 'dither' | undefined): void;
	/** Scroll choreography for one page section. */
	setSectionMotion(key: string, partKey: string, motion: SectionMotionConfig | undefined): void;
	/** Page-wide scroll scene (undefined = inherit the site scene). */
	setPageMotion(key: string, motion: SectionMotionConfig | undefined): void;
	/** Replace one page's motion/type treatments with those copied from another page. */
	applyPageEffects(key: string, source: PageConfig): void;
	/** Responsive minimum height of one page section. */
	setSectionHeight(
		key: string,
		partKey: string,
		breakpoint: 'desktop' | 'phone',
		height: number | undefined,
		viewportHeight?: number,
		gap?: number,
		recordHistory?: boolean,
	): void;
	/** Responsive minimum height of the site-wide footer. */
	setFooterHeight(breakpoint: 'desktop' | 'phone', height: number | undefined): void;
	// sharing / SEO
	/** Meta description used for search results and social link previews. */
	setSiteDescription(value: string): void;
	/** Language browsers and screen readers should use for this site. */
	setSiteLanguage(value: string): void;
	/** Per-page meta description (empty falls back to the site description). */
	setPageDescription(key: string, value: string): void;
	/** Pick which uploaded image social cards use (undefined = automatic). */
	setOgImage(sel: { folder: string; entryId: string } | undefined): void;
	// history
	canUndo: boolean;
	canRedo: boolean;
	/** Page currently open in the editor workspace; page travel is undoable. */
	historyPageKey: string | null;
	/** Travel to a page (or the page overview) as a history action. */
	navigateHistoryPage(pageKey: string | null, recordHistory?: boolean): void;
	/** Undo the last document change (Cmd+Z); the editor returns to the page the
	 *  change happened on. */
	undo(): void;
	/** Redo an undone document change (Cmd+Y / Cmd+Shift+Z). */
	redo(): void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
	const ctx = useContext(EditorContext);
	if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
	return ctx;
}

export function EditorProvider({
	children,
	persistence = 'browser',
}: {
	children: React.ReactNode;
	/** 'memory' (template studio) keeps the document out of localStorage entirely,
	 * so the owner's real draft, saved versions, and assets are never touched. */
	persistence?: 'browser' | 'memory';
}) {
	const [doc, setDocState] = useState<EditorDoc | null>(null);
	// Event handlers can make more than one change before React renders. Keep the
	// latest committed document in a ref so the second change builds on the first.
	const docRef = useRef<EditorDoc | null>(null);
	const [hasDraft, setHasDraft] = useState<boolean>(() => hasSavedDoc());
	const [draftError, setDraftError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
	const [saveError, setSaveError] = useState<string | null>(null);
	const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
	const [historyPageKey, setHistoryPageKey] = useState<string | null>(null);
	const historyPageRef = useRef<string | null>(null);
	// Downscaled asset previews finish async; bumping this re-renders every consumer
	// so getAssetPreviewUrl() calls pick up the light copies.
	const assetsVersion = useSyncExternalStore(subscribeAssets, getAssetsVersion, getAssetsVersion);

	// Full-document snapshots taken immediately before each user-visible change.
	// The stacks stay in refs; only the two availability flags enter React state.
	type HistorySnapshot = { doc: EditorDoc; pageKey: string | null };
	const undoStack = useRef<HistorySnapshot[]>([]);
	const redoStack = useRef<HistorySnapshot[]>([]);
	const lastHistoryAction = useRef<{ key: string; at: number } | null>(null);
	const syncHistoryState = useCallback(() => {
		const next = { canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 };
		setHistoryState((current) =>
			current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
		);
	}, []);
	const record = useCallback((prev: EditorDoc, actionKey?: string) => {
		const now = Date.now();
		const coalesces =
			!!actionKey &&
			lastHistoryAction.current?.key === actionKey &&
			now - lastHistoryAction.current.at < 1200 &&
			undoStack.current.length > 0;
		if (!coalesces) {
			undoStack.current.push({ doc: prev, pageKey: historyPageRef.current });
			if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
		}
		redoStack.current = [];
		lastHistoryAction.current = actionKey ? { key: actionKey, at: now } : null;
		syncHistoryState();
	}, [syncHistoryState]);

	const navigateHistoryPage = useCallback((pageKey: string | null, recordHistory = true) => {
		if (historyPageRef.current === pageKey) return;
		const current = docRef.current;
		if (recordHistory && current) {
			undoStack.current.push({ doc: current, pageKey: historyPageRef.current });
			if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
			redoStack.current = [];
			lastHistoryAction.current = null;
		}
		historyPageRef.current = pageKey;
		setHistoryPageKey(pageKey);
		syncHistoryState();
	}, [syncHistoryState]);

	/** Commit an immutable document change, recording it by default. */
	const commitDoc = useCallback(
		(change: (prev: EditorDoc) => EditorDoc, recordHistory = true, actionKey?: string) => {
			const prev = docRef.current;
			if (!prev) return;
			const next = change(prev);
			if (next === prev) return;
			if (recordHistory) record(prev, actionKey);
			docRef.current = next;
			setDocState(next);
		},
		[record],
	);

	const replaceDoc = useCallback((next: EditorDoc | null) => {
		docRef.current = next;
		setDocState(next);
	}, []);

	// Autosave (debounced) whenever the document changes.
	const timer = useRef<number | undefined>(undefined);
	const autosaveGeneration = useRef(0);
	useEffect(() => {
		if (!doc) return;
		if (persistence === 'memory') return;
		if (timer.current) window.clearTimeout(timer.current);
		const generation = autosaveGeneration.current;
		setSaveStatus('saving');
		setSaveError(null);
		timer.current = window.setTimeout(() => {
			if (generation !== autosaveGeneration.current) return;
			try {
				saveDoc(doc);
				setHasDraft(true);
				const assets = getAssetPersistenceStatus(referencedAssetIds(doc));
				if (assets.failures.length) {
					setSaveStatus('failed');
					setSaveError(`${assets.failures[0]} Replace or remove it before closing this tab.`);
				} else if (assets.pending) {
					setSaveStatus('saving');
					setSaveError(null);
				} else {
					setSaveStatus('saved');
					setSaveError(null);
				}
			} catch (error) {
				setSaveStatus('failed');
				setSaveError(
					error instanceof Error
						? error.message
						: 'Your browser could not save this draft. Its storage may be full or blocked.',
				);
			}
		}, 400);
		return () => window.clearTimeout(timer.current);
	}, [doc, assetsVersion, persistence]);

	// --- helpers to update nested content immutably ---
	const patchContent = useCallback((fn: (c: Content) => Content, recordHistory = true, actionKey?: string) => {
		commitDoc((prev) => {
			const content = fn(prev.content);
			return content === prev.content ? prev : { ...prev, content };
		}, recordHistory, actionKey);
	}, [commitDoc]);
	const patchGallery = useCallback((folder: string, fn: (entries: ImageEntry[]) => ImageEntry[], recordHistory = true, actionKey?: string) => {
		commitDoc((prev) => {
			const current = prev.galleries[folder] ?? [];
			const entries = fn(current);
			return entries === current ? prev : { ...prev, galleries: { ...prev.galleries, [folder]: entries } };
		}, recordHistory, actionKey);
	}, [commitDoc]);
	const patchPage = useCallback(
		(key: string, fn: (page: PageConfig) => PageConfig, recordHistory = true, actionKey?: string) => {
			patchContent(
				(c) => (c.pages[key] ? { ...c, pages: { ...c.pages, [key]: fn(c.pages[key]) } } : c),
				recordHistory,
				actionKey,
			);
		},
		[patchContent],
	);
	const patchBlocks = useCallback(
		(key: string, fn: (blocks: PageBlock[]) => PageBlock[], recordHistory = true, actionKey?: string) => {
			patchPage(key, (page) => ({ ...page, blocks: fn(page.blocks ?? []) }), recordHistory, actionKey);
		},
		[patchPage],
	);

	// Fresh documents start with a clean history.
	const openFresh = useCallback((next: EditorDoc | null) => {
		undoStack.current = [];
		redoStack.current = [];
		lastHistoryAction.current = null;
		historyPageRef.current = null;
		setHistoryPageKey(null);
		syncHistoryState();
		setSaveStatus('saved');
		setSaveError(null);
		replaceDoc(next);
	}, [replaceDoc, syncHistoryState]);

	const value = useMemo<EditorContextValue>(() => ({
		doc,
		hasDraft,
		draftError,
		saveStatus,
		saveError,
		canUndo: historyState.canUndo,
		canRedo: historyState.canRedo,
		historyPageKey,
		navigateHistoryPage,

		startBlank: () => openFresh(blankDoc()),
		startExisting: () => openFresh(existingDoc()),
		startTemplate: (content) => openFresh(initDocFromContent(content)),
			resumeDraft: async () => {
			setDraftError(null);
			try {
				const saved = loadSavedDoc();
					if (saved === null) {
						if (hasSavedDoc())
							throw new Error('Your saved draft is not a valid site document. The original value was kept.');
						openFresh(existingDoc());
					return;
				}
				const upgraded = parseAndMigrateEditorDoc(saved);
				const rawVersion =
					typeof saved === 'object' && saved !== null && 'docVersion' in saved
						? (saved as { docVersion?: unknown }).docVersion
						: 0;
				const rawContentVersion =
					typeof saved === 'object' &&
					saved !== null &&
					'content' in saved &&
					typeof (saved as { content?: unknown }).content === 'object' &&
					(saved as { content?: unknown }).content !== null &&
					'schemaVersion' in ((saved as { content: object }).content)
						? ((saved as { content: { schemaVersion?: unknown } }).content.schemaVersion ?? 0)
						: 0;
				if (rawVersion !== upgraded.docVersion || rawContentVersion !== upgraded.content.schemaVersion)
					backupDocBeforeMigration(saved);
				const stored = await loadAllAssetBlobs();
				for (const a of stored) restoreAsset(a.id, a.blob, a.filename);
				openFresh(upgraded);
			} catch (error) {
				setDraftError(error instanceof Error ? error.message : 'This saved draft could not be opened safely.');
			}
		},
			openDoc: async (next: EditorDoc) => {
				// Opening a downloaded/live document from the Start screen must not let
				// the next autosave silently replace a local draft the artist could still
				// need. Keep that draft as a named browser version first.
				if (!docRef.current && hasSavedDoc()) {
					const saved = loadSavedDoc();
					if (saved === null) throw new Error('Your local draft could not be preserved, so the other site was not opened.');
					await saveNamedVersion(parseAndMigrateEditorDoc(saved), 'Local draft before opening another site');
				}
				setHasDraft(true);
			openFresh(upgradeDoc(next));
		},
			reset: async () => {
				const current = docRef.current;
				autosaveGeneration.current += 1;
				if (timer.current) window.clearTimeout(timer.current);
				timer.current = undefined;
				openFresh(null);
				try {
					await waitForAssetPersistence();
					await clearPersisted();
					clearAssetRegistry();
					setHasDraft(false);
					setDraftError(null);
				} catch (error) {
					openFresh(current);
					setSaveStatus('failed');
					setSaveError(error instanceof Error ? error.message : 'This browser could not clear the saved draft.');
				}
			},

		setName: (value) => patchContent((c) => ({ ...c, site: { ...c.site, name: value } }), true, 'site:name'),
		setProfileName: (value) => patchContent((c) => ({ ...c, profile: { ...c.profile, name: value || undefined } }), true, 'profile:name'),
		setHeaderMode: (value) =>
			patchContent(
				(c) => ({ ...c, site: { ...c.site, headerMode: value } }),
				true,
				'site:header-mode',
			),
		setLogoText: (value) =>
			patchContent(
				(c) => ({ ...c, site: { ...c.site, logo: value || undefined } }),
				true,
				'site:logo',
			),
		setBio: (value, richText) =>
			patchContent(
				(c) => ({
					...c,
					profile: {
						...c.profile,
						bio: value,
						bioRichText: richText?.length ? richText : undefined,
					},
				}),
				true,
				'profile:bio',
			),
		setProfileBioFont: (value) =>
			patchContent(
				(c) => ({ ...c, profile: { ...c.profile, bioFontFamily: value || undefined } }),
				true,
				'profile:bio-font',
			),
		setEmail: (value) => patchContent((c) => ({ ...c, contact: { ...c.contact, email: value } }), true, 'contact:email'),

		setProfileImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				profileImage: { filename: file.name, assetId, sampleAssetId: null },
			}));
		},
		removeProfileImage: () =>
			commitDoc((prev) => ({
				...prev,
				profileImage: { filename: '', assetId: null, sampleAssetId: null },
				content: {
					...prev.content,
					profile: { ...prev.content.profile, imageLayout: undefined, contentLayout: undefined },
				},
			})),
		setProfileImagePresentation: (patch) =>
			patchContent(
				(content) => ({ ...content, profile: { ...content.profile, ...patch } }),
				true,
				`profile:image-presentation:${Object.keys(patch).sort().join(',')}`,
			),

		setLogoImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				logoImage: { filename: file.name, assetId, sampleAssetId: null },
			}));
		},
		removeLogoImage: () =>
			commitDoc((prev) => ({
				...prev,
				logoImage: { filename: '', assetId: null, sampleAssetId: null },
				content: { ...prev.content, site: { ...prev.content.site, logoImage: undefined } },
			})),

		setResumeFile: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				resumeFile: { filename: file.name, assetId, sampleAssetId: null },
				content: {
					...prev.content,
					resume: { label: prev.content.resume?.label ?? 'Résumé', url: sanitizeFilename(file.name) },
				},
			}));
		},
		removeResume: () =>
			commitDoc((prev) => ({
				...prev,
				resumeFile: { filename: '', assetId: null, sampleAssetId: null },
				content: { ...prev.content, resume: { label: prev.content.resume?.label ?? 'Résumé', url: '' } },
			})),
		// Spec 36 (audit row E8): the link label is a plain field. `??` keeps a
		// deliberately emptied label empty instead of resurrecting the default.
		setResumeLabel: (value) =>
			patchContent(
				(c) => ({ ...c, resume: { label: value, url: c.resume?.url ?? '' } }),
				true,
				'resume:label',
			),

		setTheme: (patch) =>
			patchContent(
				(c) => ({ ...c, theme: { ...c.theme, ...patch } }),
				true,
				`theme:${Object.keys(patch).sort().join(',')}`,
			),
		applyThemePreset: (theme) =>
			patchContent((content) => contentWithThemePreset(content, theme)),
		applyTemplate: (template) => {
			let report: TemplateApplyReport | null = null;
			commitDoc((prev) => {
				const result = applyTemplateToDoc(prev, template);
				report = result.report;
				return result.doc;
			});
			return report;
		},

		addCustomFont: (file) => {
			const name = fontNameFromFile(file.name);
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => {
				const entry = { name, file: `fonts/${sanitizeFilename(file.name)}` };
				const others = (prev.content.theme.customFonts ?? []).filter((f) => f.name !== name);
				return {
					...prev,
					content: {
						...prev.content,
						theme: {
							...prev.content.theme,
							customFonts: [...others, entry],
							fontFamily: `"${name}", sans-serif`,
						},
					},
					fonts: {
						...prev.fonts,
						[name]: { filename: file.name, assetId, sampleAssetId: null },
					},
				};
			});
		},
		removeCustomFont: (name) =>
			commitDoc((prev) => {
				const customFonts = (prev.content.theme.customFonts ?? []).filter((f) => f.name !== name);
				const fonts = { ...prev.fonts };
				delete fonts[name];
				const usesIt = prev.content.theme.fontFamily.includes(`"${name}"`);
				const headingUsesIt = prev.content.theme.headingFontFamily?.includes(`"${name}"`) ?? false;
				const pages = Object.fromEntries(
					Object.entries(prev.content.pages).map(([key, page]) => [
						key,
						{
							...page,
							blocks: page.blocks?.map((block) =>
								block.type === 'text' && block.fontFamily?.includes(`"${name}"`)
									? { ...block, fontFamily: undefined }
									: block,
							),
						},
					]),
				);
				return {
					...prev,
					content: {
						...prev.content,
						pages,
						theme: {
							...prev.content.theme,
							customFonts: customFonts.length ? customFonts : undefined,
							fontFamily: usesIt
								? '"Helvetica Neue", Helvetica, Arial, sans-serif'
								: prev.content.theme.fontFamily,
							headingFontFamily: headingUsesIt ? undefined : prev.content.theme.headingFontFamily,
						},
					},
					fonts,
				};
			}),

		addSocial: () => patchContent((c) => ({ ...c, social: [...c.social, { label: '', url: '' }] })),
		updateSocial: (index, patch) =>
			patchContent(
				(c) => ({ ...c, social: c.social.map((s, i) => (i === index ? { ...s, ...patch } : s)) }),
				true,
				`social:${index}:${Object.keys(patch).sort().join(',')}`,
			),
		removeSocial: (index) => patchContent((c) => ({ ...c, social: c.social.filter((_, i) => i !== index) })),
		moveSocial: (from, to) => patchContent((c) => ({ ...c, social: arrayMove(c.social, from, to) })),

		// ---- store ----
		setupStore: () => {
			const current = docRef.current;
			if (!current || current.content.store) return undefined;
			const key = uniquePageKey('shop', current.content.pages);
			commitDoc((prev) => {
				if (prev.content.store) return prev;
				const block: Extract<PageBlock, { type: 'products' }> = {
					id: uid('products'),
					type: 'products',
					layout: 'grid',
				};
				const page: PageConfig = {
					title: 'Shop — {name}',
					label: 'Shop',
					heading: 'Shop',
					blocks: [block],
					sections: [
						{ id: MAIN_SECTION_ID, name: 'Main section', blockIds: [block.id] },
					],
				};
				return {
					...prev,
					content: {
						...prev.content,
						store: { currency: 'USD', products: [] },
						nav: [...prev.content.nav, { path: key, label: 'Shop' }],
						pages: { ...prev.content.pages, [key]: page },
					},
				};
			});
			return key;
		},
		setStoreCurrency: (currency) => {
			const normalized = currency.trim().toUpperCase();
			patchContent((content) =>
				content.store &&
				/^[A-Z]{3}$/.test(normalized) &&
				(!SUPPORTED_CURRENCY_CODES || SUPPORTED_CURRENCY_CODES.has(normalized))
					? {
							...content,
							store: { ...content.store, currency: normalized },
						}
					: content,
			);
		},
		addProduct: () =>
			commitDoc((prev) => {
				if (!prev.content.store) return prev;
				const productId = uid('product');
				const product: StoreProduct = {
					id: productId,
					name: '',
					imageAlt: '',
					status: 'draft',
					offers: [
						{
							id: uid('offer'),
							label: '',
							amountMinor: 0,
							checkout: { provider: 'stripe_payment_link', url: '' },
						},
					],
				};
				return {
					...prev,
					content: {
						...prev.content,
						store: { ...prev.content.store, products: [...prev.content.store.products, product] },
					},
					productImages: {
						...prev.productImages,
						[productId]: { filename: '', assetId: null, sampleAssetId: null },
					},
				};
			}),
		updateProduct: (productId, patch) =>
			patchContent(
				(content) =>
					content.store
						? {
								...content,
								store: {
									...content.store,
									products: content.store.products.map((product) =>
										product.id === productId
											? {
													...product,
													...patch,
													id: product.id,
													image: product.image,
													offers: product.offers,
												}
											: product,
									),
								},
							}
						: content,
				true,
				`store:product:${productId}:${Object.keys(patch).sort().join(',')}`,
			),
		removeProduct: (productId) =>
			commitDoc((prev) => {
				if (!prev.content.store?.products.some((product) => product.id === productId)) return prev;
				const productImages = { ...prev.productImages };
				delete productImages[productId];
				const pages = Object.fromEntries(
					Object.entries(prev.content.pages).map(([key, page]) => [
						key,
						{
							...page,
							blocks: page.blocks?.map((block) =>
								block.type === 'products' && block.productIds
									? {
											...block,
											productIds: block.productIds.filter((id) => id !== productId),
										}
									: block,
							),
						},
					]),
				);
				return {
					...prev,
					content: {
						...prev.content,
						store: {
							...prev.content.store,
							products: prev.content.store.products.filter((product) => product.id !== productId),
						},
						pages,
					},
					productImages,
				};
			}),
		moveProduct: (from, to) =>
			patchContent((content) => {
				if (
					!content.store ||
					from === to ||
					from < 0 ||
					to < 0 ||
					from >= content.store.products.length ||
					to >= content.store.products.length
				)
					return content;
				return {
					...content,
					store: { ...content.store, products: arrayMove(content.store.products, from, to) },
				};
			}),
		setProductImage: (productId, file) => {
			if (!docRef.current?.content.store?.products.some((product) => product.id === productId)) return;
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => {
				if (!prev.content.store?.products.some((product) => product.id === productId)) return prev;
				return {
					...prev,
					content: {
						...prev.content,
						store: {
							...prev.content.store,
							products: prev.content.store.products.map((product) =>
								product.id === productId ? { ...product, image: undefined } : product,
							),
						},
					},
					productImages: {
						...prev.productImages,
						[productId]: { filename: file.name, assetId, sampleAssetId: null },
					},
				};
			});
		},
		setProductImageFromGallery: (productId, folder, entryId) =>
			commitDoc((prev) => {
				if (!prev.content.store?.products.some((product) => product.id === productId)) return prev;
				const entry = prev.galleries[folder]?.find((candidate) => candidate.id === entryId);
				if (!entry) return prev;
				return {
					...prev,
					content: {
						...prev.content,
						store: {
							...prev.content.store,
							products: prev.content.store.products.map((product) =>
								product.id === productId
									? { ...product, image: `${folder}/${entry.filename}` }
									: product,
							),
						},
					},
					productImages: {
						...prev.productImages,
						[productId]: {
							filename: entry.filename,
							assetId: entry.assetId,
							sampleAssetId: entry.sampleAssetId,
						},
					},
				};
			}),
		removeProductImage: (productId) =>
			commitDoc((prev) => {
				if (!prev.content.store?.products.some((product) => product.id === productId)) return prev;
				return {
					...prev,
					content: {
						...prev.content,
						store: {
							...prev.content.store,
							products: prev.content.store.products.map((product) =>
								product.id === productId ? { ...product, image: undefined } : product,
							),
						},
					},
					productImages: {
						...prev.productImages,
						[productId]: { filename: '', assetId: null, sampleAssetId: null },
					},
				};
			}),
		addProductOffer: (productId) =>
			patchContent((content) => {
				if (!content.store) return content;
				const offer: StoreOffer = {
					id: uid('offer'),
					label: '',
					amountMinor: 0,
					checkout: { provider: 'stripe_payment_link', url: '' },
				};
				return {
					...content,
					store: {
						...content.store,
						products: content.store.products.map((product) =>
							product.id === productId
								? { ...product, offers: [...product.offers, offer] }
								: product,
						),
					},
				};
			}),
		updateProductOffer: (productId, offerId, patch) =>
			patchContent(
				(content) =>
					content.store
						? {
								...content,
								store: {
									...content.store,
									products: content.store.products.map((product) =>
										product.id === productId
											? {
													...product,
													offers: product.offers.map((offer) =>
														offer.id === offerId
															? {
																	...offer,
																	...patch,
																	id: offer.id,
																	checkout: patch.checkout
																		? { ...offer.checkout, ...patch.checkout, provider: 'stripe_payment_link' }
																		: offer.checkout,
																}
															: offer,
													),
												}
											: product,
									),
								},
							}
						: content,
				true,
				`store:product:${productId}:offer:${offerId}:${Object.keys(patch).sort().join(',')}`,
			),
		removeProductOffer: (productId, offerId) =>
			patchContent((content) =>
				content.store
					? {
							...content,
							store: {
								...content.store,
								products: content.store.products.map((product) =>
									product.id === productId
										? {
												...product,
												offers: product.offers.filter((offer) => offer.id !== offerId),
											}
										: product,
								),
							},
						}
					: content,
			),
		moveProductOffer: (productId, from, to) =>
			patchContent((content) => {
				if (!content.store) return content;
				const product = content.store.products.find((candidate) => candidate.id === productId);
				if (
					!product ||
					from === to ||
					from < 0 ||
					to < 0 ||
					from >= product.offers.length ||
					to >= product.offers.length
				)
					return content;
				return {
					...content,
					store: {
						...content.store,
						products: content.store.products.map((candidate) =>
							candidate.id === productId
								? { ...candidate, offers: arrayMove(candidate.offers, from, to) }
								: candidate,
						),
					},
				};
			}),

		// ---- pages ----
		addPage: (label, projectTemplate, options) =>
			commitDoc((prev) => withGalleryPage(prev, label, projectTemplate, options).doc),

		addChildPage: (parentKey, label, sectionId) =>
			commitDoc((prev) => {
				if (!prev.content.pages[parentKey]) return prev;
				const desired = parentKey === 'home' ? slugify(label) : `${parentKey}/${slugify(label)}`;
				const key = uniquePageKey(desired, prev.content.pages);
				const folder = uniqueFolder(key.replace(/\//g, '-'), prev);
				const name = label.trim() || 'New page';
				const page: PageConfig = {
					title: `${name} — {name}`,
					label: name,
					gallery: { folder, alt: name, order: 'asc' },
					blocks: [{ id: 'gallery', type: 'gallery' }],
					sections: [{ id: MAIN_SECTION_ID, name: 'Main section', blockIds: ['gallery'] }],
				};
				const parent = prev.content.pages[parentKey];
				const legacyItems = (parent.children ?? []).map((childKey) => ({
					id: uid('subpage'),
					page: childKey,
					label: prev.content.pages[childKey]?.label ?? childKey,
				}));
				const parentBlocks = (parent.blocks ?? []).map((block) =>
					block.type === 'children' && !block.items ? { ...block, items: legacyItems } : block,
				);
				const targetSection = pageSections(parent).find((section) => section.id === sectionId);
				const targetBlock = parentBlocks.find(
					(block): block is Extract<PageBlock, { type: 'children' }> =>
						block.type === 'children' &&
						sectionId !== NEW_SECTION_ID &&
						(!sectionId || !!targetSection?.blockIds.includes(block.id)),
				);
				const item = { id: uid('subpage'), page: key, label: name };
				let parentWithChildren: PageConfig;
				if (targetBlock) {
					const existingItems = targetBlock.items ?? legacyItems;
					parentWithChildren = pageWithSections({
						...parent,
						blocks: parentBlocks.map((block) =>
							block.id === targetBlock.id ? { ...targetBlock, items: [...existingItems, item] } : block,
						),
					});
				} else {
					const parentDraft = { ...parent, blocks: parentBlocks };
					const canvasBottom = freeCanvasBottomInSection(prev, parentDraft, sectionId);
					const childrenBlock: PageBlock = {
						id: uid('children'),
						type: 'children',
						items: [item],
						// In a freeform-canvas section the sub-page cards go straight onto
						// the canvas (below the art) — in-flow they would overlap it.
						...(canvasBottom !== null
							? { canvasLayout: collectionLayoutAtCanvasBottom('children', canvasBottom) }
							: {}),
					};
					parentWithChildren = appendBlockToSection(parentDraft, childrenBlock, sectionId);
				}
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: page,
							[parentKey]: {
								...parentWithChildren,
								children: [...(parent.children ?? []), key],
							},
						},
						galleries: { ...prev.content.galleries, [folder]: { items: {} } },
					},
					galleries: { ...prev.galleries, [folder]: [] },
				};
			}),

		removePage: (key) =>
			commitDoc((prev) => {
				if (key === 'home' || !prev.content.pages[key]) return prev;
				const doomed = pageTreeKeys(prev.content.pages, key);
				const doomedFolders = [...doomed].flatMap((k) => {
					const page = prev.content.pages[k];
					return page ? pageGalleryConfigs(page).map((g) => g.folder) : [];
				});

				const pages: Record<string, PageConfig> = {};
				for (const [k, page] of Object.entries(prev.content.pages)) {
					if (doomed.has(k)) continue;
					let nextPage = page;
					if (page.children?.some((child) => doomed.has(child))) {
						const children = page.children.filter((child) => !doomed.has(child));
						const removedChildBlocks = children.length
							? []
							: (page.blocks ?? []).filter((block) => block.type === 'children').map((block) => block.id);
						nextPage = {
							...page,
							children,
							blocks: children.length ? page.blocks : page.blocks?.filter((b) => b.type !== 'children'),
							sections: children.length
								? pageSections(page)
								: removeBlocksFromSections(page, new Set(removedChildBlocks)),
							mobile: withoutPhonePageBlocks(page.mobile, removedChildBlocks),
						};
					}
					// A Sub-pages block may link owned children or any other page. Remove
					// only cards whose destination was deleted; never discard its siblings.
					const blocks = nextPage.blocks?.map((block) =>
						block.type === 'children' && block.items
							? { ...block, items: block.items.filter((item) => !doomed.has(item.page)) }
							: block,
					);
					pages[k] = blocks ? { ...nextPage, blocks } : nextPage;
				}
				const contentGalleries = { ...prev.content.galleries };
				const docGalleries = { ...prev.galleries };
				const stillUsed = referencedGalleryFolders(pages, prev.content.sectionLibrary);
				for (const folder of doomedFolders) {
					if (stillUsed.has(folder)) continue;
					delete contentGalleries[folder];
					delete docGalleries[folder];
				}
				const pageThumbs = { ...prev.pageThumbs };
				for (const k of doomed) delete pageThumbs[k];

				return {
					...prev,
					content: {
						...prev.content,
						nav: prev.content.nav.filter((item) => !doomed.has(item.path || 'home')),
						pages,
						galleries: contentGalleries,
					},
					galleries: docGalleries,
					pageThumbs,
				};
			}),

		movePage: (from, to) => patchContent((c) => ({ ...c, nav: arrayMove(c.nav, from, to) })),

		duplicatePage: (key) =>
			commitDoc((prev) => {
				const source = prev.content.pages[key];
				if (!source) return prev;
				const sourceLabel = source.label || prev.content.nav.find((item) => (item.path || 'home') === key)?.label || 'Page';
				const label = `${sourceLabel} copy`;
				const nextKey = uniquePageKey(slugify(label), prev.content.pages);
				const usedFolders = new Set([...Object.keys(prev.galleries), ...Object.keys(prev.content.galleries)]);
				const nextGalleries = { ...prev.galleries };
				const nextContentGalleries = { ...prev.content.galleries };
				let groupNumber = 0;

				const copyGallery = (config: GalleryConfig, preferred: string): GalleryConfig => {
					let folder = preferred;
					for (let n = 2; usedFolders.has(folder); n++) folder = `${preferred}-${n}`;
					usedFolders.add(folder);
					nextGalleries[folder] = (prev.galleries[config.folder] ?? []).map((entry) => ({
						...entry,
						meta: { ...entry.meta },
					}));
					nextContentGalleries[folder] = {
						items: { ...(prev.content.galleries[config.folder]?.items ?? {}) },
					};
					return { ...config, folder };
				};

				const blocks = (source.blocks ?? [])
					.filter((block) => block.type !== 'children')
					.map((block) => {
						if (block.type !== 'images') return { ...block };
						groupNumber += 1;
						return { ...block, gallery: copyGallery(block.gallery, `${nextKey}-set-${groupNumber}`) };
					});
				const keptBlockIds = new Set(blocks.map((block) => block.id));
				const page: PageConfig = {
					...source,
					label,
					title: `${label} — {name}`,
					draft: true,
					children: undefined,
					blocks,
					sections: pageSections(source)
						.map((section) => ({
							...section,
							blockIds: section.blockIds.filter((id) => keptBlockIds.has(id)),
						}))
						.filter((section) => section.id === MAIN_SECTION_ID || section.blockIds.length > 0),
					mobile: withoutPhonePageBlocks(
						source.mobile,
						(source.blocks ?? []).filter((block) => block.type === 'children').map((block) => block.id),
					),
					gallery: source.gallery ? copyGallery(source.gallery, nextKey) : undefined,
				};
				const sourceIndex = prev.content.nav.findIndex((item) => (item.path || 'home') === key);
				const nav = prev.content.nav.slice();
				nav.splice(sourceIndex >= 0 ? sourceIndex + 1 : nav.length, 0, { path: nextKey, label });
				const sourceThumb = prev.pageThumbs[key];

				return {
					...prev,
					content: {
						...prev.content,
						nav,
						pages: { ...prev.content.pages, [nextKey]: page },
						galleries: nextContentGalleries,
					},
					galleries: nextGalleries,
					pageThumbs: sourceThumb ? { ...prev.pageThumbs, [nextKey]: { ...sourceThumb } } : prev.pageThumbs,
				};
			}),

		setPageMenuVisibility: (key, visible) =>
			patchContent((content) => ({
				...content,
				nav: content.nav.map((item) =>
					(item.path || 'home') === key ? { ...item, hidden: visible ? undefined : true } : item,
				),
			})),
		setPageDraft: (key, draft) =>
			patchPage(key, (page) => ({ ...page, draft: key === 'home' || !draft ? undefined : true })),
		setPageNoindex: (key, noindex) =>
			patchPage(key, (page) => ({ ...page, noindex: noindex ? true : undefined })),
			setPageTitle: (key, title) => patchPage(key, (page) => ({ ...page, title }), true, `page:${key}:title`),
			setPageMobile: (key, mobile) => patchPage(key, (page) => ({ ...page, mobile })),
		changePagePath: (key, requestedPath) =>
			commitDoc((prev) => {
				if (key === 'home' || !prev.content.pages[key]) return prev;
				const affected = Object.keys(prev.content.pages).filter((candidate) => candidate === key || candidate.startsWith(`${key}/`));
				const affectedSet = new Set(affected);
				const desired = slugify(requestedPath);
				let root = desired;
				for (let n = 2; ; n++) {
					const proposed = affected.map((oldKey) => `${root}${oldKey.slice(key.length)}`);
					const collides = proposed.some(
						(candidate) => RESERVED_KEYS.has(candidate) || (!!prev.content.pages[candidate] && !affectedSet.has(candidate)),
					);
					if (!collides) break;
					root = `${desired}-${n}`;
				}
				if (root === key) return prev;
				const mapping = new Map(affected.map((oldKey) => [oldKey, `${root}${oldKey.slice(key.length)}`]));
				const rewriteInternalLink = (value: string | undefined): string | undefined => {
					if (!value?.startsWith('/')) return value;
					const match = /^\/([^?#]*)(.*)$/.exec(value);
					if (!match) return value;
					const clean = match[1].replace(/\/$/, '');
					const mapped = mapping.get(clean);
					return mapped ? `/${mapped}${match[1].endsWith('/') ? '/' : ''}${match[2]}` : value;
				};
				const pages: Record<string, PageConfig> = {};
				for (const [oldKey, page] of Object.entries(prev.content.pages)) {
					const mappedKey = mapping.get(oldKey) ?? oldKey;
					pages[mappedKey] = {
						...page,
						children: page.children?.map((child) => mapping.get(child) ?? child),
						blocks: page.blocks?.map((block) => {
							if (block.type === 'button') return { ...block, url: rewriteInternalLink(block.url) ?? block.url };
							if (block.type === 'text') {
								const richText = block.richText?.map((paragraph) => ({
									...paragraph,
									runs: paragraph.runs.map((run) => ({
										...run,
										link: rewriteInternalLink(run.link),
									})),
								}));
								return {
									...block,
									link: rewriteInternalLink(block.link),
									richText,
								};
							}
							return block;
						}),
					};
				}
				const pageThumbs = { ...prev.pageThumbs };
				for (const [oldKey, mappedKey] of mapping) {
					if (!pageThumbs[oldKey]) continue;
					pageThumbs[mappedKey] = pageThumbs[oldKey];
					delete pageThumbs[oldKey];
				}
				return {
					...prev,
					content: {
						...prev.content,
						pages,
						nav: prev.content.nav.map((item) =>
							item.path === key ? { ...item, path: root } : item,
						),
					},
					pageThumbs,
				};
			}),

		moveChildPage: (parentKey, from, to) =>
			patchPage(parentKey, (page) => ({ ...page, children: arrayMove(page.children ?? [], from, to) })),

		renamePage: (key, label) =>
			patchContent((c) => {
				// The home page's nav entry uses path '' — map the key back to it.
				const navPath = key === 'home' ? '' : key;
				return {
					...c,
					nav: c.nav.map((item) => (item.path === navPath ? { ...item, label } : item)),
					pages: c.pages[key] ? { ...c.pages, [key]: { ...c.pages[key], label } } : c.pages,
				};
			}, true, `page:${key}:label`),

		setPageHeading: (key, heading) =>
			patchPage(key, (page) => ({ ...page, heading: heading || undefined }), true, `page:${key}:heading`),
		setPageHanging: (key, hanging) =>
			patchPage(
				key,
				(page) => ({
					...page,
					hanging,
					hangingStrength: hanging === true ? page.hangingStrength : undefined,
				}),
				true,
				`page:${key}:hanging`,
			),
		setPageHangingStrength: (key, strength) =>
			patchPage(
				key,
				(page) => ({
					...page,
					hangingStrength:
						strength === undefined
							? undefined
							: Math.max(0.25, Math.min(5, strength)),
				}),
				true,
				`page:${key}:hanging-strength`,
			),
		setHeadingKinetic: (key, headingKinetic) =>
			patchPage(
				key,
				(page) => ({ ...page, headingKinetic }),
				true,
				`page:${key}:heading-kinetic`,
			),
		setProjectDetails: (key, project) =>
			patchPage(
				key,
				(page) => ({ ...page, project }),
				true,
				`page:${key}:project-details`,
			),

		setPageThumb: (key, file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				pageThumbs: {
					...prev.pageThumbs,
					[key]: { filename: file.name, assetId, sampleAssetId: null },
				},
			}));
		},
		removePageThumb: (key) =>
			commitDoc((prev) => {
				const pageThumbs = { ...prev.pageThumbs };
				delete pageThumbs[key];
				const page = prev.content.pages[key];
				const pages = page ? { ...prev.content.pages, [key]: { ...page, thumbnail: undefined } } : prev.content.pages;
				return { ...prev, pageThumbs, content: { ...prev.content, pages } };
			}),

		// ---- page blocks ----
		addTextBlock: (key, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const destination = targetSectionId(page, sectionId);
				const bottom = sectionCanvasBottom(prev, page, destination);
				const block: PageBlock = {
					id: uid('t'),
					type: 'text',
					text: '',
					layout: { x: 25, y: bottom + 2, w: 50 },
				};
				const nextPage = appendBlockToSection(page, block, destination);
				return {
					...prev,
					content: {
						...prev.content,
						pages: { ...prev.content.pages, [key]: nextPage },
					},
				};
			}),
		updateTextBlock: (key, blockId, text) =>
			patchBlocks(
				key,
				(blocks) => blocks.map((b) => (b.id === blockId && b.type === 'text' ? { ...b, text } : b)),
				true,
				`page:${key}:text:${blockId}`,
			),
		updateRichTextBlock: (key, blockId, text, richText) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'text'
							? {
									...block,
									text,
									richText,
									align: undefined,
									style: undefined,
								}
							: block,
					),
				true,
				`page:${key}:rich-text:${blockId}`,
			),
		setTextFont: (key, blockId, fontFamily) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'text'
						? { ...block, fontFamily: fontFamily || undefined }
						: block,
				),
			),
		setTextBackground: (key, blockId, background) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'text'
							? { ...block, background: background || undefined }
							: block,
					),
				true,
				`page:${key}:text-background:${blockId}`,
			),
		setTextAlign: (key, blockId, align) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'text' ? { ...b, align: align === 'left' ? undefined : align } : b,
				),
			),
		setTextStyle: (key, blockId, style) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'text'
						? { ...block, style: style === 'body' ? undefined : style }
						: block,
				),
			),
		setTextLink: (key, blockId, link) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'text' ? { ...block, link: link || undefined } : block,
				),
			true, `page:${key}:text-link:${blockId}`),
		setTextKinetic: (key, blockId, kinetic) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'text'
							? { ...block, kinetic }
							: block,
					),
				true,
				`page:${key}:text-kinetic:${blockId}`,
			),
		setTextFlowLayout: (key, blockId, flowLayout) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'text'
							? { ...block, flowLayout }
							: block,
					),
				true,
				`page:${key}:text-flow-layout:${blockId}`,
			),
		setTextLayout: (key, blockId, layout) => {
			// Record real placement changes only. The preview re-commits text heights
			// after measuring the rendered text; height-only corrections are automatic.
			const block = docRef.current?.content.pages[key]?.blocks?.find((b) => b.id === blockId);
			const old = block?.type === 'text' ? block.layout : undefined;
			const moved = layout
				? !old || old.x !== layout.x || old.y !== layout.y || old.w !== layout.w || old.z !== layout.z
				: old !== undefined;
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((candidate) => candidate.id === blockId);
				if (!target || target.type !== 'text') return prev;
				const blocks = (page.blocks ?? []).map((candidate) =>
					candidate.id === blockId && candidate.type === 'text'
						? { ...candidate, layout }
						: candidate,
				);
				let nextPage: PageConfig = { ...page, blocks };
				if (!layout && nextPage.gallery)
					nextPage = {
						...nextPage,
						gallery: withoutPhoneItem(nextPage.gallery, `text:${blockId}`),
					};
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}, moved);
		},
		setGalleryConfig: (key, patch, actionKey) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page?.gallery) return prev;
				const galleryBlockId = page.blocks?.find((block) => block.type === 'gallery')?.id;
				let nextPage: PageConfig = { ...page, gallery: { ...page.gallery, ...patch } };
				const isCanvas = galleryBlockId ? pageHasCanvas(nextPage, galleryBlockId) : false;
				if (!isCanvas && nextPage.gallery) {
					for (const block of nextPage.blocks ?? []) {
						if ((block.type !== 'text' && block.type !== 'embed') || !block.layout) continue;
						if (
							galleryBlockId &&
							blockSection(nextPage, block.id)?.id !==
								blockSection(nextPage, galleryBlockId)?.id
						)
							continue;
						const canvasKey = `${block.type === 'text' ? 'text' : 'video'}:${block.id}`;
						nextPage = {
							...nextPage,
							gallery: withoutPhoneItem(nextPage.gallery!, canvasKey),
						};
					}
				}
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}, true, actionKey),
		addFreeformGallery: (key, beforeBlockId, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				let nextPage = pageWithSections(page);
				const blocks = [...(nextPage.blocks ?? [])];
				const destination = targetSectionId(
					nextPage,
					sectionId ?? blockSection(nextPage, beforeBlockId ?? '')?.id,
				);
				const destinationSection = pageSections(nextPage).find((section) => section.id === destination);
				const destinationIds = new Set(destinationSection?.blockIds ?? []);
				const alreadyHasCanvas = blocks.some(
					(block) =>
						destinationIds.has(block.id) &&
						((block.type === 'gallery' && page.gallery?.layout !== 'grid') ||
							(block.type === 'images' && block.gallery.carousel !== true && block.gallery.layout !== 'grid')),
				);
				if (alreadyHasCanvas) return prev;

				const hasPrimaryGallery = blocks.some((block) => block.type === 'gallery');
				const folder = hasPrimaryGallery
					? uniqueFolder(`${key.replace(/\//g, '-')}-canvas`, prev)
					: page.gallery?.folder ?? uniqueFolder(`${key.replace(/\//g, '-')}-images`, prev);
				const block: PageBlock = hasPrimaryGallery
					? {
							id: uid('g'),
							type: 'images',
							name: 'Freeform canvas',
							gallery: { folder, alt: page.label ?? key, order: 'asc' },
						}
					: { id: uid('gallery'), type: 'gallery' };
				const insertAt = beforeBlockId
					? blocks.findIndex((candidate) => candidate.id === beforeBlockId)
					: -1;
				blocks.splice(insertAt >= 0 ? insertAt : blocks.length, 0, block);
				nextPage = {
					...nextPage,
					gallery: hasPrimaryGallery
						? nextPage.gallery
						: {
								...(page.gallery ?? { folder, alt: page.label ?? key, order: 'asc' as const }),
								folder,
								layout: undefined,
							},
					blocks,
					sections: pageSections(nextPage).map((section) =>
						section.id === destination
							? {
									...section,
									blockIds: beforeBlockId && section.blockIds.includes(beforeBlockId)
										? [
												...section.blockIds.slice(0, section.blockIds.indexOf(beforeBlockId)),
												block.id,
												...section.blockIds.slice(section.blockIds.indexOf(beforeBlockId)),
											]
										: [...section.blockIds, block.id],
								}
							: section,
					),
				};
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: nextPage,
						},
						galleries: {
							...prev.content.galleries,
							[folder]: prev.content.galleries[folder] ?? { items: {} },
						},
					},
					galleries: {
						...prev.galleries,
						[folder]: prev.galleries[folder] ?? [],
					},
				};
			}),
		addImagesBlock: (key, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const folder = uniqueFolder(`${key.replace(/\//g, '-')}-set`, prev);
				const block: PageBlock = {
					id: uid('g'),
					type: 'images',
					gallery: { folder, alt: page.label ?? key, order: 'asc' },
				};
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: appendBlockToSection(page, block, sectionId),
						},
						galleries: { ...prev.content.galleries, [folder]: { items: {} } },
					},
					galleries: { ...prev.galleries, [folder]: [] },
				};
			}),
		updateImagesBlock: (key, blockId, patch, actionKey) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'images' ? { ...b, gallery: { ...b.gallery, ...patch } } : b,
				),
			true, actionKey),
		renameImagesBlock: (key, blockId, name) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'images' ? { ...b, name: name || undefined } : b,
				),
			true, `page:${key}:image-group-name:${blockId}`),
		setChildrenStyle: (key, blockId, style) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'children'
						? { ...b, style: style === 'cards' ? undefined : style }
						: b,
				),
			),
		updateChildrenBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'children'
						? { ...block, ...patch }
						: block,
				),
			true,
			`page:${key}:sub-pages:${blockId}`,
		),
		renameChildCard: (key, blockId, itemId, label) =>
			patchPage(key, (page) => ({
				...page,
				blocks: (page.blocks ?? []).map((block) => {
					if (block.id !== blockId || block.type !== 'children') return block;
					// Legacy blocks derive their cards from page.children — materialize
					// them so the rename has an item to live on. Cards left without a
					// label keep falling back to their page's name at render time.
					const items =
						block.items ??
						(page.children ?? []).map((childKey) => ({ id: childKey, page: childKey }));
					return {
						...block,
						items: items.map((item) => (item.id === itemId ? { ...item, label } : item)),
					};
				}),
			}), true, `page:${key}:sub-pages:${blockId}:label:${itemId}`),
		setWidgetLayout: (key, blockId, canvasLayout) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id !== blockId ? block :
					block.type === 'project' ? { ...block, layout: canvasLayout } :
					block.type === 'form' ? { ...block, layout: canvasLayout } :
					block.type === 'divider' ? { ...block, layout: canvasLayout } :
					(block.type === 'children' || block.type === 'products') ? { ...block, canvasLayout } : block,
				),
			),
		setSignature: (data) => patchContent((c) => ({ ...c, site: { ...c.site, signature: data } })),
		setSignatureImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				signatureImage: { filename: file.name, assetId, sampleAssetId: null },
				content: {
					...prev.content,
					site: {
						...prev.content.site,
						signature: {
							strokes: prev.content.site.signature?.strokes ?? [],
							...prev.content.site.signature,
							image: file.name,
						},
					},
				},
			}));
		},
		removeSignatureImage: () =>
			commitDoc((prev) => {
				const signature = prev.content.site.signature;
				const nextSignature = signature
					? { ...signature, image: undefined }
					: undefined;
				return {
					...prev,
					signatureImage: { filename: '', assetId: null, sampleAssetId: null },
					content: {
						...prev.content,
						site: {
							...prev.content.site,
							signature:
								nextSignature && (nextSignature.strokes.length || nextSignature.align)
									? nextSignature
									: undefined,
						},
					},
				};
			}),
		setFooter: (value) =>
			patchContent((c) => ({ ...c, site: { ...c.site, footer: value || undefined } }), true, 'site:footer'),
		setFooterName: (value) =>
			patchContent((c) => ({ ...c, site: { ...c.site, footerName: value || undefined } }), true, 'site:footer-name'),
		setFooterNameSize: (value) =>
			patchContent(
				(c) => ({
					...c,
					site: {
						...c.site,
						footerNameSize:
							value === undefined || !Number.isFinite(value)
								? undefined
								: Math.min(Math.max(Math.round(value), 8), 300),
					},
				}),
				true,
				'site:footer-name-size',
			),
		setFooterColumns: (columns) =>
			patchContent(
				(c) => ({ ...c, site: { ...c.site, footerColumns: columns?.length ? columns : undefined } }),
				true,
				'site:footer-columns',
			),
		setFooterImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				footerImage: { filename: file.name, assetId, sampleAssetId: null },
			}));
		},
		removeFooterImage: () =>
			commitDoc((prev) => ({
				...prev,
				footerImage: { filename: '', assetId: null, sampleAssetId: null },
				content: { ...prev.content, site: { ...prev.content.site, footerImage: undefined, footerImageLayout: undefined } },
			})),
		setFooterImageLayout: (footerImageLayout) =>
			patchContent((content) => ({ ...content, site: { ...content.site, footerImageLayout } }), true, 'site:footer-image-layout'),
		addEmbedBlock: (key, kind = 'video', sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const destination = targetSectionId(page, sectionId);
				const width = kind === 'map' ? 72 : kind === 'audio' ? 68 : 60;
				const ar = kind === 'map' ? 4 / 3 : kind === 'audio' ? 5.4 : 16 / 9;
				const block: PageBlock = {
					id: uid(kind === 'map' ? 'map' : kind === 'audio' ? 'audio' : 'v'),
					type: 'embed',
					kind,
					url: '',
					layout: {
						x: (100 - width) / 2,
						y: sectionCanvasBottom(prev, page, destination) + 2,
						w: width,
						ar,
					},
				};
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: appendBlockToSection(page, block, destination),
						},
					},
				};
			}),
		updateEmbedBlock: (key, blockId, url) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((b) => {
						if (b.id !== blockId || b.type !== 'embed') return b;
						const spec = embedSpec(url);
						return {
							...b,
							url,
							kind: spec?.kind ?? b.kind,
							layout: b.layout && spec ? { ...b.layout, ar: spec.aspectRatio } : b.layout,
						};
					}),
				true,
				`page:${key}:embed:${blockId}`,
			),
		setEmbedFlowLayout: (key, blockId, flowLayout) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'embed'
							? { ...block, flowLayout }
							: block,
					),
				true,
				`page:${key}:embed-flow-layout:${blockId}`,
			),
		setEmbedLayout: (key, blockId, layout) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((candidate) => candidate.id === blockId);
				if (!target || target.type !== 'embed') return prev;
				const blocks = (page.blocks ?? []).map((candidate) =>
					candidate.id === blockId && candidate.type === 'embed'
						? { ...candidate, layout }
						: candidate,
				);
				let nextPage: PageConfig = { ...page, blocks };
				if (!layout && nextPage.gallery)
					nextPage = {
						...nextPage,
						gallery: withoutPhoneItem(nextPage.gallery, `video:${blockId}`),
					};
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}),
		addShotsBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(page, {
					id: uid('shots'),
					type: 'shots',
					src: '',
					scrollLength: 260,
					fadeIntoPage: true,
					fadeStart: 70,
					fadeDuration: 30,
					fit: 'cover',
				}, sectionId),
			),
		setShotsFile: (key, blockId, file) => {
			const assetId = registerAsset(file, file.name);
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'shots'
						? { ...block, src: '', assetId, filename: file.name }
						: block,
				),
			);
		},
		updateShotsBlock: (key, blockId, patch) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'shots'
							? {
									...block,
									...patch,
									...('src' in patch
										? { assetId: null, filename: undefined }
										: {}),
								}
							: block,
					),
				true,
				`page:${key}:shots:${blockId}:${Object.keys(patch).sort().join(',')}`,
			),
		addButtonBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(
					page,
					{ id: uid('button'), type: 'button', label: 'View project', url: '', appearance: 'solid' },
					sectionId,
				),
			),
		updateButtonBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'button' ? { ...block, ...patch } : block,
				),
			true, `page:${key}:button:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addDividerBlock: (key, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const destination = targetSectionId(page, sectionId);
				const bottom = destination === NEW_SECTION_ID
					? 0
					: sectionCanvasBottom(prev, page, destination);
				const block: PageBlock = {
					id: uid('divider'),
					type: 'divider',
					layout: { x: 5, y: bottom > 0 ? bottom + 2 : 0, w: 90, ar: 45 },
				};
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: appendBlockToSection(page, block, sectionId),
						},
					},
				};
			}),
		updateDividerBlock: (key, blockId, patch) =>
			patchBlocks(
				key,
				(blocks) =>
					blocks.map((block) =>
						block.id === blockId && block.type === 'divider'
							? { ...block, ...patch }
							: block,
					),
				true,
				`page:${key}:divider:${blockId}:${Object.keys(patch).sort().join(',')}`,
			),
		addAboutBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				(page.blocks ?? []).some((block) => block.type === 'about')
					? page
					: appendBlockToSection(page, { id: uid('about'), type: 'about' }, sectionId),
			),
		addContactBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(page, {
					id: uid('contact'),
					type: 'contact',
					heading: 'Get in touch',
					text: 'Email me about commissions, prints, or studio visits.',
					email: EMPTY_CONTACT_EMAIL,
					buttonLabel: DEFAULT_CONTACT_BUTTON_LABEL,
				}, sectionId),
			),
		updateContactBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'contact'
						? { ...block, ...patch, id: block.id, type: 'contact' }
						: block,
				),
			true, `page:${key}:contact:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addFormBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(page, {
					id: uid('form'),
					type: 'form',
					heading: 'Get in touch',
					action: '',
					successMessage: 'Thanks — your message has been sent.',
					fields: [
						{ id: uid('field'), type: 'name', label: 'Name', required: true },
						{ id: uid('field'), type: 'email', label: 'Email', required: true },
						{ id: uid('field'), type: 'textarea', label: 'Message', required: true },
					],
				}, sectionId),
			),
		updateFormBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'form' ? { ...block, ...patch, id: block.id, type: 'form' } : block,
				),
			true, `page:${key}:form:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addShapeBlock: (key, shape, sectionId) =>
			patchPage(key, (page) => {
				const current = docRef.current;
				const canvasBottom = current ? freeCanvasBottomInSection(current, page, sectionId) : null;
				const y = (canvasBottom ?? 0) + 2;
				// Born freeform, sized per primitive: a wide hairline, a shorter arrow,
				// a modest rectangle. The artist drags/resizes from there.
				const layout =
					shape === 'rectangle'
						? { x: 30, y, w: 40, ar: 1.5 }
						: shape === 'arrow'
							? { x: 35, y, w: 30, ar: 6 }
							: { x: 25, y, w: 50, ar: 25 };
				return appendBlockToSection(page, { id: uid('shape'), type: 'shape', shape, layout }, sectionId);
			}),
		updateShapeBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'shape'
						? { ...block, ...patch, id: block.id, type: 'shape' }
						: block,
				),
			true, `page:${key}:shape:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addAccordionBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(page, {
					id: uid('accordion'),
					type: 'accordion',
					items: [
						{ id: uid('row'), title: 'First row', text: 'Words shown when this row is open.' },
						{ id: uid('row'), title: 'Second row', text: '' },
						{ id: uid('row'), title: 'Third row', text: '' },
					],
				}, sectionId),
			),
		updateAccordionBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'accordion'
						? { ...block, ...patch, id: block.id, type: 'accordion' }
						: block,
				),
			true, `page:${key}:accordion:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addProductsBlock: (key, sectionId) =>
			patchPage(key, (page) => {
				// Same canvas parity as sub-pages: in a freeform section the product
				// cards hang on the canvas below the art instead of overlapping it.
				const current = docRef.current;
				const canvasBottom = current ? freeCanvasBottomInSection(current, page, sectionId) : null;
				return appendBlockToSection(
					page,
					{
						id: uid('products'),
						type: 'products',
						layout: 'grid',
						...(canvasBottom !== null
							? { canvasLayout: collectionLayoutAtCanvasBottom('products', canvasBottom) }
							: {}),
					},
					sectionId,
				);
			}),
		updateProductsBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) => {
				const knownProductIds = new Set(
					docRef.current?.content.store?.products.map((product) => product.id) ?? [],
				);
				const normalized = { ...patch };
				if ('productIds' in patch && patch.productIds)
					normalized.productIds = [
						...new Set(patch.productIds.filter((productId) => knownProductIds.has(productId))),
					];
				return blocks.map((block) =>
					block.id === blockId && block.type === 'products'
						? { ...block, ...normalized, id: block.id, type: 'products' }
						: block,
				);
			}, true, `page:${key}:products:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addProjectBlock: (key, sectionId) =>
			patchPage(key, (page) =>
				appendBlockToSection(page, {
					id: uid('project'),
					type: 'project',
					project: { template: 'artwork' },
				}, sectionId),
			),
		updateProjectBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) => blocks.map((block) =>
				block.id === blockId && block.type === 'project' ? { ...block, ...patch } : block,
			), true, `page:${key}:project:${blockId}:${Object.keys(patch).sort().join(',')}`),
		changeBlockType: (key, blockId, type) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				const current = page?.blocks?.find((block) => block.id === blockId);
				if (!page || !current || current.type === type) return prev;
				if (
					type === 'about' &&
					(page.blocks ?? []).some((block) => block.id !== blockId && block.type === 'about')
				) return prev;

				let nextDoc = prev;
				let nextPage = page;
				const label =
					current.type === 'text' ? current.text :
					current.type === 'button' ? current.label :
					current.type === 'form' ? current.heading ?? '' :
					current.type === 'contact' ? current.heading ?? '' : '';
				let replacement: PageBlock;
				switch (type) {
					case 'text':
						replacement = { id: blockId, type, text: label };
						break;
					case 'embed':
						replacement = { id: blockId, type, kind: 'video', url: '' };
						break;
					case 'shots':
						replacement = { id: blockId, type, src: '', scrollLength: 260, fadeIntoPage: true, fadeStart: 70, fadeDuration: 30, fit: 'cover' };
						break;
					case 'gallery': {
						if (!nextPage.gallery) {
							const folder = uniqueFolder(`${key.replace(/\//g, '-')}-gallery`, prev);
							nextPage = { ...nextPage, gallery: { folder, alt: nextPage.label ?? key, order: 'asc' } };
							nextDoc = {
								...nextDoc,
								content: { ...nextDoc.content, galleries: { ...nextDoc.content.galleries, [folder]: { items: {} } } },
								galleries: { ...nextDoc.galleries, [folder]: [] },
							};
						}
						replacement = { id: blockId, type };
						break;
					}
					case 'images': {
						const folder = uniqueFolder(`${key.replace(/\//g, '-')}-set`, nextDoc);
						replacement = { id: blockId, type, gallery: { folder, alt: nextPage.label ?? key, order: 'asc' } };
						nextDoc = {
							...nextDoc,
							content: { ...nextDoc.content, galleries: { ...nextDoc.content.galleries, [folder]: { items: {} } } },
							galleries: { ...nextDoc.galleries, [folder]: [] },
						};
						break;
					}
					case 'children': replacement = { id: blockId, type }; break;
					case 'about': replacement = { id: blockId, type }; break;
					case 'button': replacement = { id: blockId, type, label: label || 'View project', url: '', appearance: 'solid' }; break;
					case 'divider': replacement = { id: blockId, type }; break;
					case 'products': replacement = { id: blockId, type, layout: 'grid' }; break;
					case 'project': replacement = { id: blockId, type, project: { template: 'artwork' } }; break;
					case 'contact': replacement = {
						id: blockId, type,
						heading: label || 'Get in touch',
						text: 'Email me about commissions, prints, or studio visits.',
						email: EMPTY_CONTACT_EMAIL,
						buttonLabel: DEFAULT_CONTACT_BUTTON_LABEL,
					}; break;
					case 'form': replacement = {
						id: blockId, type, heading: label || 'Get in touch', action: '',
						successMessage: 'Thanks — your message has been sent.',
						fields: [
							{ id: uid('field'), type: 'name', label: 'Name', required: true },
							{ id: uid('field'), type: 'email', label: 'Email', required: true },
							{ id: uid('field'), type: 'textarea', label: 'Message', required: true },
						],
					}; break;
				}
				nextPage = {
					...nextPage,
					blocks: (nextPage.blocks ?? []).map((block) => block.id === blockId ? replacement : block),
				};
				return {
					...nextDoc,
					content: {
						...nextDoc.content,
						pages: { ...nextDoc.content.pages, [key]: nextPage },
					},
				};
			}),
		removeBlock: (key, blockId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((b) => b.id === blockId);
				const blocks = (page.blocks ?? []).filter((b) => b.id !== blockId);
				const phoneKey = target?.type === 'text' ? `text:${target.id}` : target?.type === 'embed' ? `video:${target.id}` : null;
				const owner = blockSection(page, blockId);
				const sections = removeBlocksFromSections(page, new Set([blockId]));
				const sectionRemoved =
					!!owner && !sections.some((section) => section.id === owner.id);
				const sectionKey = owner ? sectionPartKey(owner.id) : `block:${blockId}`;
				const sectionColors = { ...(page.sectionColors ?? {}) };
				const sectionHeights = { ...(page.sectionHeights ?? {}) };
				const sectionMotion = { ...(page.sectionMotion ?? {}) };
				const sectionBleed = { ...(page.sectionBleed ?? {}) };
				if (sectionRemoved) {
					delete sectionColors[sectionKey];
					delete sectionHeights[sectionKey];
					delete sectionMotion[sectionKey];
					delete sectionBleed[sectionKey];
				}
				const nextPage = {
						...page,
						blocks,
						sections,
						sectionColors: Object.keys(sectionColors).length ? sectionColors : undefined,
						sectionHeights: Object.keys(sectionHeights).length ? sectionHeights : undefined,
						sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
						sectionBleed: Object.keys(sectionBleed).length ? sectionBleed : undefined,
						mobile: page.mobile && sectionRemoved
							? {
								...page.mobile,
								order: page.mobile.order.filter((item) => item !== sectionKey),
								items: Object.fromEntries(
									Object.entries(page.mobile.items ?? {}).filter(([item]) => item !== sectionKey),
								),
							}
							: page.mobile,
						gallery:
							target?.type === 'gallery'
								? undefined
								: phoneKey && page.gallery
									? withoutPhoneItem(page.gallery, phoneKey)
									: page.gallery,
					};
				const next = {
					...prev,
					content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } },
				};
				// Removing either kind of image group takes its folder (and images)
				// off the site when nothing else still references it.
				const removedFolder =
					target?.type === 'images'
						? target.gallery.folder
						: target?.type === 'gallery'
							? page.gallery?.folder
							: undefined;
				if (removedFolder) {
					const stillUsed = referencedGalleryFolders(
						next.content.pages,
						next.content.sectionLibrary,
					);
					if (!stillUsed.has(removedFolder)) {
						const contentGalleries = { ...next.content.galleries };
						delete contentGalleries[removedFolder];
						next.content = { ...next.content, galleries: contentGalleries };
						const docGalleries = { ...prev.galleries };
						delete docGalleries[removedFolder];
						next.galleries = docGalleries;
					}
				}
				return next;
			}),
		duplicateBlock: (key, blockId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				const source = (page?.blocks ?? []).find((b) => b.id === blockId);
				if (!page || !source) return prev;
				// About is one-per-page, sub-page cards mirror real child pages, and
				// the legacy main gallery is single by definition.
				if (source.type === 'about' || source.type === 'children' || source.type === 'gallery')
					return prev;
				let block = cloneReusableBlock(source);
				let next = prev;
				if (block.type === 'images' && source.type === 'images') {
					const folder = uniqueFolder(`${key.replace(/\//g, '-')}-set`, prev);
					const entries = (prev.galleries[source.gallery.folder] ?? []).map((entry) => ({
						...(JSON.parse(JSON.stringify(entry)) as (typeof prev.galleries)[string][number]),
						id: uid('e'),
					}));
					// Fresh entry ids invalidate any phone-order keys; drop the
					// customization so the copy starts from the automatic order.
					block = { ...block, gallery: { ...block.gallery, folder, mobile: undefined } };
					next = {
						...prev,
						content: {
							...prev.content,
							galleries: {
								...prev.content.galleries,
								[folder]: JSON.parse(
									JSON.stringify(prev.content.galleries[source.gallery.folder] ?? { items: {} }),
								),
							},
						},
						galleries: { ...prev.galleries, [folder]: entries },
					};
				}
				// Canvas-pinned copies nudge down-right so they never cover the original.
				const nudge = <L extends { x: number; y: number }>(layout: L): L => ({
					...layout,
					x: Math.min(layout.x + 2, 94),
					y: layout.y + 2,
				});
				if (block.type === 'text' && block.layout) block = { ...block, layout: nudge(block.layout) };
				else if (block.type === 'embed' && block.layout) block = { ...block, layout: nudge(block.layout) };
				else if (block.type === 'divider' && block.layout) block = { ...block, layout: nudge(block.layout) };
				else if (block.type === 'project' && block.layout) block = { ...block, layout: nudge(block.layout) };
				else if (block.type === 'form' && block.layout) block = { ...block, layout: nudge(block.layout) };
				else if (block.type === 'products' && block.canvasLayout)
					block = { ...block, canvasLayout: nudge(block.canvasLayout) };
				const blocks = [...(page.blocks ?? [])];
				const at = blocks.findIndex((b) => b.id === blockId);
				blocks.splice(at + 1, 0, block);
				const owner = blockSection(page, blockId);
				const sections = pageSections(page).map((section) =>
					section.id === owner?.id
						? {
								...section,
								blockIds: section.blockIds.flatMap((id) =>
									id === blockId ? [id, block.id] : [id],
								),
							}
						: section,
				);
				return {
					...next,
					content: {
						...next.content,
						pages: {
							...next.content.pages,
							[key]: { ...page, blocks, sections },
						},
					},
				};
			}),
		removeSection: (key, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const allSections = pageSections(page);
				if (allSections.length <= 1) return prev;
				const section = allSections.find((candidate) => candidate.id === sectionId);
				if (!section) return prev;
				const removedIds = new Set(section.blockIds);
				const targets = (page.blocks ?? []).filter((b) => removedIds.has(b.id));
				const blocks = (page.blocks ?? []).filter((b) => !removedIds.has(b.id));
				const sections = allSections.filter((candidate) => candidate.id !== sectionId);
				const partKey = sectionPartKey(sectionId);
				const sectionColors = { ...(page.sectionColors ?? {}) };
				const sectionHeights = { ...(page.sectionHeights ?? {}) };
				const sectionMotion = { ...(page.sectionMotion ?? {}) };
				const sectionBleed = { ...(page.sectionBleed ?? {}) };
				delete sectionColors[partKey];
				delete sectionHeights[partKey];
				delete sectionMotion[partKey];
				delete sectionBleed[partKey];
				const removedLegacyGallery = targets.some((b) => b.type === 'gallery');
				const nextPage = {
					...page,
					blocks,
					sections,
					sectionColors: Object.keys(sectionColors).length ? sectionColors : undefined,
					sectionHeights: Object.keys(sectionHeights).length ? sectionHeights : undefined,
					sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
					sectionBleed: Object.keys(sectionBleed).length ? sectionBleed : undefined,
					mobile: page.mobile
						? {
								...page.mobile,
								order: page.mobile.order.filter((item) => item !== partKey),
								items: Object.fromEntries(
									Object.entries(page.mobile.items ?? {}).filter(([item]) => item !== partKey),
								),
							}
						: page.mobile,
					gallery: removedLegacyGallery ? undefined : page.gallery,
				};
				const next = {
					...prev,
					content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } },
				};
				const candidateFolders = new Set(
					targets.flatMap((b) =>
						b.type === 'images'
							? [b.gallery.folder]
							: b.type === 'gallery' && page.gallery
								? [page.gallery.folder]
								: [],
					),
				);
				if (candidateFolders.size) {
					const stillUsed = referencedGalleryFolders(
						next.content.pages,
						next.content.sectionLibrary,
					);
					const contentGalleries = { ...next.content.galleries };
					const docGalleries = { ...prev.galleries };
					let changed = false;
					for (const folder of candidateFolders)
						if (!stillUsed.has(folder)) {
							delete contentGalleries[folder];
							delete docGalleries[folder];
							changed = true;
						}
					if (changed) {
						next.content = { ...next.content, galleries: contentGalleries };
						next.galleries = docGalleries;
					}
				}
				return next;
			}),
		moveBlock: (key, from, to) => patchBlocks(key, (blocks) => arrayMove(blocks, from, to)),
		moveBlockInSection: (key, sectionId, from, to) =>
			patchPage(key, (page) => ({
				...page,
				sections: pageSections(page).map((section) =>
					section.id === sectionId &&
					from >= 0 &&
					to >= 0 &&
					from < section.blockIds.length &&
					to < section.blockIds.length
						? { ...section, blockIds: arrayMove(section.blockIds, from, to) }
						: section,
				),
			})),
		moveSection: (key, from, to) =>
			patchPage(key, (page) => {
				const sections = pageSections(page);
				if (
					from === to ||
					from < 0 ||
					to < 0 ||
					from >= sections.length ||
					to >= sections.length
				)
					return pageWithSections(page, sections);
				return pageWithSections(page, arrayMove(sections, from, to));
			}),
		renameSection: (key, sectionId, name) =>
			patchPage(
				key,
				(page) => ({
					...page,
					sections: pageSections(page).map((section) =>
						section.id === sectionId
							? { ...section, name: name.trim() || 'Untitled section' }
							: section,
					),
				}),
				true,
				`page:${key}:section-name:${sectionId}`,
			),
		setSectionEditorColor: (key, sectionId, color) =>
			patchPage(key, (page) => ({
				...page,
				sections: pageSections(page).map((section) =>
					section.id === sectionId
						? { ...section, editorColor: color || undefined }
						: section,
				),
			})),
		moveBlockToSection: (key, blockId, sectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const currentSections = pageSections(page);
				const sourceIndex = currentSections.findIndex((section) =>
					section.blockIds.includes(blockId),
				);
				const source = currentSections[sourceIndex];
				const creatingSection = sectionId === NEW_SECTION_ID;
				const destination = creatingSection
					? {
							id: uid('section'),
							name: `Section ${currentSections.length + 1}`,
							blockIds: [] as string[],
						}
					: currentSections.find((section) => section.id === sectionId);
				if (!source || !destination || source.id === destination.id) return prev;
				const bottom = sectionCanvasBottom(prev, page, destination.id);
				const removedSource = source.id !== MAIN_SECTION_ID && source.blockIds.length === 1;
				const workingSections = [...currentSections];
				if (creatingSection) workingSections.splice(sourceIndex + 1, 0, destination);
				const sections = workingSections
					.map((section) => {
						if (section.id === source.id)
							return {
								...section,
								blockIds: section.blockIds.filter((id) => id !== blockId),
							};
						if (section.id === destination.id)
							return { ...section, blockIds: [...section.blockIds, blockId] };
						return section;
					})
					.filter((section) => section.id === MAIN_SECTION_ID || section.blockIds.length > 0);
				const blocks = (page.blocks ?? []).map((block) => {
					if (block.id !== blockId) return block;
					if (block.type === 'text' && block.layout)
						return { ...block, layout: { ...block.layout, y: bottom + 2 } };
					if (block.type === 'embed' && block.layout)
						return { ...block, layout: { ...block.layout, y: bottom + 2 } };
					return block;
				});
				const sourceKey = sectionPartKey(source.id);
				const destinationKey = sectionPartKey(destination.id);
				const sectionColors = { ...(page.sectionColors ?? {}) };
				const sectionHeights = { ...(page.sectionHeights ?? {}) };
				const sectionMotion = { ...(page.sectionMotion ?? {}) };
				const sectionBleed = { ...(page.sectionBleed ?? {}) };
				if (creatingSection) {
					if (page.sectionColors?.[sourceKey])
						sectionColors[destinationKey] = page.sectionColors[sourceKey];
					if (page.sectionHeights?.[sourceKey])
						sectionHeights[destinationKey] = { ...page.sectionHeights[sourceKey] };
					if (page.sectionMotion?.[sourceKey])
						sectionMotion[destinationKey] = { ...page.sectionMotion[sourceKey] };
					if (page.sectionBleed?.[sourceKey]) sectionBleed[destinationKey] = true;
				}
				if (removedSource) {
					delete sectionColors[sourceKey];
					delete sectionHeights[sourceKey];
					delete sectionMotion[sourceKey];
					delete sectionBleed[sourceKey];
				}
				const nextPage: PageConfig = {
					...page,
					blocks,
					sections,
					sectionColors: Object.keys(sectionColors).length ? sectionColors : undefined,
					sectionHeights: Object.keys(sectionHeights).length ? sectionHeights : undefined,
					sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
					sectionBleed: Object.keys(sectionBleed).length ? sectionBleed : undefined,
					mobile:
						page.mobile && removedSource
							? {
									...page.mobile,
									order: page.mobile.order.filter((item) => item !== sourceKey),
									items: Object.fromEntries(
										Object.entries(page.mobile.items ?? {}).filter(
											([item]) => item !== sourceKey,
										),
									),
								}
							: page.mobile,
				};
				return {
					...prev,
					content: {
						...prev.content,
						pages: { ...prev.content.pages, [key]: nextPage },
					},
				};
			}),
		toggleBlockSection: (key, blockId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const sections = pageSections(page);
				const sourceIndex = sections.findIndex((section) =>
					section.blockIds.includes(blockId),
				);
				if (sourceIndex < 0) return prev;
				const source = sections[sourceIndex];
				const isDedicated =
					source.id !== MAIN_SECTION_ID && source.blockIds.length === 1;
				if (isDedicated) {
					const main = sections.find((section) => section.id === MAIN_SECTION_ID) ?? sections[0];
					const bottom = sectionCanvasBottom(prev, page, main.id);
					const nextSections = sections
						.map((section) => {
							if (section.id === main.id)
								return { ...section, blockIds: [...section.blockIds, blockId] };
							return section;
						})
						.filter((section) => section.id !== source.id);
					const blocks = (page.blocks ?? []).map((block) => {
						if (block.id !== blockId) return block;
						if (block.type === 'text' && block.layout)
							return { ...block, layout: { ...block.layout, y: bottom + 2 } };
						if (block.type === 'embed' && block.layout)
							return { ...block, layout: { ...block.layout, y: bottom + 2 } };
						return block;
					});
					const sourceKey = sectionPartKey(source.id);
					const sectionColors = { ...(page.sectionColors ?? {}) };
					const sectionHeights = { ...(page.sectionHeights ?? {}) };
					const sectionMotion = { ...(page.sectionMotion ?? {}) };
					delete sectionColors[sourceKey];
					delete sectionHeights[sourceKey];
					delete sectionMotion[sourceKey];
					return {
						...prev,
						content: {
							...prev.content,
							pages: {
								...prev.content.pages,
								[key]: {
									...page,
									blocks,
									sections: nextSections,
									sectionColors: Object.keys(sectionColors).length
										? sectionColors
										: undefined,
									sectionHeights: Object.keys(sectionHeights).length
										? sectionHeights
										: undefined,
									sectionMotion: Object.keys(sectionMotion).length
										? sectionMotion
										: undefined,
									mobile: page.mobile
										? {
												...page.mobile,
												order: page.mobile.order.filter((item) => item !== sourceKey),
												items: Object.fromEntries(
													Object.entries(page.mobile.items ?? {}).filter(
														([item]) => item !== sourceKey,
													),
												),
											}
										: undefined,
								},
							},
						},
					};
				}
				const newId = uid('section');
				const newSection: PageSection = {
					id: newId,
					name: `Section ${sections.length + 1}`,
					blockIds: [blockId],
				};
				const nextSections = sections.map((section) =>
					section.id === source.id
						? {
								...section,
								blockIds: section.blockIds.filter((id) => id !== blockId),
							}
						: section,
				);
				nextSections.splice(sourceIndex + 1, 0, newSection);
				const sourceKey = sectionPartKey(source.id);
				const destinationKey = sectionPartKey(newId);
				const blocks = (page.blocks ?? []).map((block) => {
					if (block.id !== blockId) return block;
					if (block.type === 'text' && block.layout)
						return { ...block, layout: { ...block.layout, y: 2 } };
					if (block.type === 'embed' && block.layout)
						return { ...block, layout: { ...block.layout, y: 2 } };
					return block;
				});
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: {
								...page,
								blocks,
								sections: nextSections,
								sectionColors: page.sectionColors?.[sourceKey]
									? {
											...page.sectionColors,
											[destinationKey]: page.sectionColors[sourceKey],
										}
									: page.sectionColors,
								sectionHeights: page.sectionHeights?.[sourceKey]
									? {
											...page.sectionHeights,
											[destinationKey]: { ...page.sectionHeights[sourceKey] },
										}
									: page.sectionHeights,
								sectionMotion: page.sectionMotion?.[sourceKey]
									? {
											...page.sectionMotion,
											[destinationKey]: { ...page.sectionMotion[sourceKey] },
										}
									: page.sectionMotion,
							},
						},
					},
				};
			}),
		saveSectionTemplate: (key, blockId, name) =>
			patchContent((content) => {
				const page = content.pages[key];
				const source = page?.blocks?.find((block) => block.id === blockId);
				if (!page || !source) return content;
				const block =
					source.type === 'gallery' && page.gallery
						? ({
								id: source.id,
								type: 'images',
								name: `${page.label || key} images`,
								gallery: { ...page.gallery },
							} satisfies Extract<PageBlock, { type: 'images' }>)
						: (JSON.parse(JSON.stringify(source)) as PageBlock);
				const partKey = sectionPartKey(
					blockSection(page, blockId)?.id ?? MAIN_SECTION_ID,
				);
				const template: SavedSectionTemplate = {
					id: uid('section'),
					name: name.trim() || `${page.label || key} section`,
					block,
					motion: page.sectionMotion?.[partKey]
						? { ...page.sectionMotion[partKey] }
						: undefined,
					color: page.sectionColors?.[partKey],
					heights: page.sectionHeights?.[partKey]
						? { ...page.sectionHeights[partKey] }
						: undefined,
				};
				return {
					...content,
					sectionLibrary: [...(content.sectionLibrary ?? []), template],
				};
			}),
		insertSectionTemplate: (key, templateId, requestedSectionId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				const template = prev.content.sectionLibrary?.find((item) => item.id === templateId);
				if (!page || !template) return prev;
				if (
					template.block.type === 'about' &&
					(page.blocks ?? []).some((block) => block.type === 'about')
				) return prev;
				const block = cloneReusableBlock(template.block);
				const existingSection =
					requestedSectionId && requestedSectionId !== NEW_SECTION_ID
						? pageSections(page).find((section) => section.id === requestedSectionId)
						: undefined;
				const sectionId = existingSection?.id ?? uid('section');
				const partKey = sectionPartKey(sectionId);
				const sections = existingSection
					? pageSections(page).map((section) =>
							section.id === existingSection.id
								? { ...section, blockIds: [...section.blockIds, block.id] }
								: section,
						)
					: [
							...pageSections(page),
							{ id: sectionId, name: template.name, blockIds: [block.id] },
						];
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: {
								...page,
								blocks: [...(page.blocks ?? []), block],
								sections,
								sectionMotion: !existingSection && template.motion
									? { ...(page.sectionMotion ?? {}), [partKey]: { ...template.motion } }
									: page.sectionMotion,
								sectionColors: !existingSection && template.color
									? { ...(page.sectionColors ?? {}), [partKey]: template.color }
									: page.sectionColors,
								sectionHeights: !existingSection && template.heights
									? { ...(page.sectionHeights ?? {}), [partKey]: { ...template.heights } }
									: page.sectionHeights,
							},
						},
					},
				};
			}),
		removeSectionTemplate: (templateId) =>
			patchContent((content) => {
				const sectionLibrary = (content.sectionLibrary ?? []).filter(
					(template) => template.id !== templateId,
				);
				return {
					...content,
					sectionLibrary: sectionLibrary.length ? sectionLibrary : undefined,
				};
			}),

		addGalleryImages: (folder, images) =>
			patchGallery(folder, (entries) => [
				...entries,
				...images.map(({ file, alt, decorative, workbenchFolder }) => ({
					id: uid('e'),
					filename: file.name,
					meta: {
						title: '',
						alt,
						decorative,
						description: '',
						link: '',
						workbenchFolder,
					},
					assetId: registerAsset(file, file.name),
					sampleAssetId: null,
				})),
			]),
		createWorkbenchFolder: (name) =>
			commitDoc((prev) => {
				const clean = name.trim().slice(0, 80);
				if (!clean || (prev.workbenchFolders ?? []).includes(clean)) return prev;
				return {
					...prev,
					workbenchFolders: [...(prev.workbenchFolders ?? []), clean],
				};
			}),
		buildPagesFromWorkbench: (sampleStarterId) => {
			let report: WorkbenchBuildReport | null = null;
			commitDoc((prev) => {
				const result = buildWorkbenchPages(prev, sampleStarterId);
				report = result.report;
				const changed =
					result.report.built.length ||
					result.report.sampled.length ||
					result.report.createdPages.length;
				return changed ? result.doc : prev;
			});
			return report;
		},
		transferGalleryImage: (sourceFolder, entryId, targetFolder, move = false) =>
			commitDoc((prev) => {
				if (sourceFolder === targetFolder) return prev;
				const source = prev.galleries[sourceFolder]?.find((entry) => entry.id === entryId);
				if (!source) return prev;
				const clone = cloneEntryForGroup(source, targetFolder === WORKBENCH_FOLDER);
				const galleries = {
					...prev.galleries,
					[targetFolder]: [...(prev.galleries[targetFolder] ?? []), clone],
				};
				if (move)
					galleries[sourceFolder] = (prev.galleries[sourceFolder] ?? []).filter(
						(entry) => entry.id !== entryId,
					);
				const pages = move
					? Object.fromEntries(
							Object.entries(prev.content.pages).map(([pageKey, page]) => [
								pageKey,
								{
									...page,
									gallery:
										page.gallery?.folder === sourceFolder
											? withoutPhoneItem(page.gallery, `image:${entryId}`)
											: page.gallery,
									blocks: page.blocks?.map((block) =>
										block.type === 'images' &&
										block.gallery.folder === sourceFolder
											? {
													...block,
													gallery: withoutPhoneItem(
														block.gallery,
														`image:${entryId}`,
													),
												}
											: block,
									),
								},
							]),
						)
					: prev.content.pages;
				return {
					...prev,
					galleries,
					content: { ...prev.content, pages },
					ogImage:
						move &&
						prev.ogImage?.folder === sourceFolder &&
						prev.ogImage.entryId === entryId
							? undefined
							: prev.ogImage,
				};
			}),
		replaceGalleryImage: (folder, id, { file, alt, decorative }) => {
			const assetId = registerAsset(file, file.name);
			patchGallery(folder, (entries) =>
				entries.map((entry) => {
					if (entry.id !== id) return entry;
					const meta = entry.sampleAssetId
						? {
								title: '',
								alt,
								decorative,
								description: '',
								link: '',
								clickAction: undefined,
								layout: entry.meta.layout,
							}
						: { ...entry.meta, alt, decorative };
					return {
						...entry,
						filename: file.name,
						meta,
						assetId,
						sampleAssetId: null,
					};
				}),
			);
		},
		replaceSampleWithSuccessor: (folder, id) =>
			patchGallery(folder, (entries) =>
				entries.map((entry) =>
					entry.id === id ? entryWithSampleSuccessor(entry) : entry,
				),
			),
		removeGalleryImage: (folder, id) =>
			commitDoc((prev) => ({
				...prev,
				ogImage:
					prev.ogImage?.folder === folder && prev.ogImage.entryId === id ? undefined : prev.ogImage,
				galleries: { ...prev.galleries, [folder]: (prev.galleries[folder] ?? []).filter((entry) => entry.id !== id) },
				content: {
					...prev.content,
					pages: Object.fromEntries(
						Object.entries(prev.content.pages).map(([pageKey, page]) => [
							pageKey,
							{
								...page,
								gallery: page.gallery?.folder === folder ? withoutPhoneItem(page.gallery, `image:${id}`) : page.gallery,
								blocks: page.blocks?.map((block) =>
									block.type === 'images' && block.gallery.folder === folder
										? { ...block, gallery: withoutPhoneItem(block.gallery, `image:${id}`) }
										: block,
								),
							},
							]),
						),
					},
				})),
		moveGalleryImage: (folder, from, to) => patchGallery(folder, (entries) => arrayMove(entries, from, to)),
		shuffleGalleryImages: (folder) =>
			patchGallery(folder, (entries) => {
				if (entries.length < 2) return entries;
				// Fisher–Yates; nudge the last card forward if the deal came back identical.
				const shuffled = [...entries];
				for (let i = shuffled.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
				}
				return shuffled.every((entry, i) => entry === entries[i])
					? [shuffled[shuffled.length - 1], ...shuffled.slice(0, -1)]
					: shuffled;
			}),
		clearGalleryImageSettings: (folder) =>
			patchGallery(folder, (entries) =>
				entries.map((entry) => ({
					...entry,
					meta: {
						...entry.meta,
						effects: undefined,
						cropAspect: undefined,
						cropZoom: undefined,
						focusX: undefined,
						focusY: undefined,
					},
				})),
			),
		resetGalleryCrops: (folder) =>
			patchGallery(folder, (entries) =>
				entries.map((entry) => ({
					...entry,
					meta: { ...entry.meta, cropAspect: undefined, cropZoom: undefined, focusX: undefined, focusY: undefined },
				})),
			),
		applyGalleryCropAll: (folder, aspect, zoom) =>
			patchGallery(folder, (entries) =>
				entries.map((entry) => ({
					...entry,
					meta: {
						...entry.meta,
						cropAspect: aspect,
						cropZoom: zoom > 1 ? Math.round(zoom * 100) / 100 : undefined,
					},
				})),
			),
		updateGalleryMeta: (folder, id, patch) => {
			// An image move and every metadata edit are undoable. The first layout an
			// image receives is automatic canvas flow, so that one commit stays out of
			// history and cannot push an artist's real changes off the stack.
			const oldLayout = docRef.current?.galleries[folder]?.find((e) => e.id === id)?.meta.layout;
			const recordHistory = !patch.layout || oldLayout !== undefined;
			patchGallery(
				folder,
				(entries) => entries.map((e) => (e.id === id ? { ...e, meta: { ...e.meta, ...patch } } : e)),
				recordHistory,
				patch.layout ? undefined : `gallery:${folder}:${id}:${Object.keys(patch).sort().join(',')}`,
			);
		},
		setGalleryLayouts: (folder, layouts) =>
			patchGallery(folder, (entries) =>
				entries.map((e) => (layouts[e.id] ? { ...e, meta: { ...e.meta, layout: layouts[e.id] } } : e)),
			),
		applyCanvasLayouts: (pageKey, folder, updates) =>
			commitDoc((prev) => {
				const page = prev.content.pages[pageKey];
				if (!page) return prev;
				const imageUpdates = updates.images ?? {};
				const textUpdates = updates.texts ?? {};
				const embedUpdates = updates.embeds ?? {};
				const widgetUpdates = updates.widgets ?? {};
				const currentEntries = prev.galleries[folder] ?? [];
				const entries = currentEntries.map((entry) =>
					imageUpdates[entry.id]
						? { ...entry, meta: { ...entry.meta, layout: imageUpdates[entry.id] } }
						: entry,
				);
				const currentBlocks = page.blocks ?? [];
				const blocks = currentBlocks.map((block) => {
					if (block.type === 'text' && textUpdates[block.id])
						return { ...block, layout: textUpdates[block.id] };
					if (block.type === 'embed' && embedUpdates[block.id])
						return { ...block, layout: embedUpdates[block.id] };
					if (block.type === 'images' && widgetUpdates[block.id])
						return {
							...block,
							gallery: { ...block.gallery, carouselFrame: widgetUpdates[block.id] },
						};
					if (
						(block.type === 'children' || block.type === 'products') &&
						widgetUpdates[block.id]
					)
						return { ...block, canvasLayout: widgetUpdates[block.id] };
					return block;
				});
				if (entries === currentEntries && blocks === currentBlocks) return prev;
				return {
					...prev,
					galleries: { ...prev.galleries, [folder]: entries },
					content: {
						...prev.content,
						pages: { ...prev.content.pages, [pageKey]: { ...page, blocks } },
					},
				};
			}),
		deleteCanvasItems: (pageKey, folder, selection) =>
			commitDoc((prev) => {
				const page = prev.content.pages[pageKey];
				if (!page) return prev;
				const imageIds = new Set(selection.images ?? []);
				const textIds = new Set(selection.texts ?? []);
				const embedIds = new Set(selection.embeds ?? []);
				const widgetIds = new Set(selection.widgets ?? []);
				if (!imageIds.size && !textIds.size && !embedIds.size && !widgetIds.size)
					return prev;

				const removedBlockIds = new Set([...textIds, ...embedIds, ...widgetIds]);
				const removedBlocks = (page.blocks ?? []).filter((block) =>
					removedBlockIds.has(block.id),
				);
				const canvasPhoneKeys = [
					...[...imageIds].map((id) => `image:${id}`),
					...[...textIds].map((id) => `text:${id}`),
					...[...embedIds].map((id) => `video:${id}`),
					...[...widgetIds].map((id) => `widget:${id}`),
				];
				const cleanGallery = (config: GalleryConfig): GalleryConfig => {
					let next = config;
					for (const itemKey of canvasPhoneKeys) next = withoutPhoneItem(next, itemKey);
					return next;
				};

				const blocks = (page.blocks ?? [])
					.filter((block) => !removedBlockIds.has(block.id))
					.map((block) =>
						block.type === 'images' && block.gallery.folder === folder
							? { ...block, gallery: cleanGallery(block.gallery) }
							: block,
					);
				const sectionColors = { ...(page.sectionColors ?? {}) };
				const sectionHeights = { ...(page.sectionHeights ?? {}) };
				const sectionMotion = { ...(page.sectionMotion ?? {}) };
				const sections = removeBlocksFromSections(page, removedBlockIds);
				const remainingSectionIds = new Set(sections.map((section) => section.id));
				const removedSectionKeys = pageSections(page)
					.filter((section) => !remainingSectionIds.has(section.id))
					.map((section) => sectionPartKey(section.id));
				for (const sectionKey of removedSectionKeys) {
					delete sectionColors[sectionKey];
					delete sectionHeights[sectionKey];
					delete sectionMotion[sectionKey];
				}
				const mobileItems = Object.fromEntries(
					Object.entries(page.mobile?.items ?? {}).filter(
						([item]) => !removedSectionKeys.includes(item),
					),
				);
				const nextPage: PageConfig = {
					...page,
					blocks,
					sections,
					gallery:
						page.gallery?.folder === folder
							? cleanGallery(page.gallery)
							: page.gallery,
					mobile: page.mobile
						? {
								...page.mobile,
								order: page.mobile.order.filter(
									(item) => !removedSectionKeys.includes(item),
								),
								items: Object.keys(mobileItems).length ? mobileItems : undefined,
							}
						: undefined,
					sectionColors: Object.keys(sectionColors).length ? sectionColors : undefined,
					sectionHeights: Object.keys(sectionHeights).length ? sectionHeights : undefined,
					sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
				};
				const pages = { ...prev.content.pages, [pageKey]: nextPage };
				const galleries = {
					...prev.galleries,
					...(folder
						? {
								[folder]: (prev.galleries[folder] ?? []).filter(
									(entry) => !imageIds.has(entry.id),
								),
							}
						: {}),
				};
				const contentGalleries = { ...prev.content.galleries };

				// A deleted hosted carousel owns an image-group folder. Remove that
				// folder only when no page or saved reusable section still uses it.
				const candidateFolders = removedBlocks.flatMap((block) =>
					block.type === 'images' ? [block.gallery.folder] : [],
				);
				const stillUsed = referencedGalleryFolders(
					pages,
					prev.content.sectionLibrary,
				);
				for (const candidate of candidateFolders) {
					if (stillUsed.has(candidate)) continue;
					delete galleries[candidate];
					delete contentGalleries[candidate];
				}

				return {
					...prev,
					ogImage:
						prev.ogImage?.folder === folder && imageIds.has(prev.ogImage.entryId)
							? undefined
							: prev.ogImage,
					galleries,
					content: {
						...prev.content,
						pages,
						galleries: contentGalleries,
					},
				};
			}),

		setCursorImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				cursorImage: { filename: file.name, assetId, sampleAssetId: null },
				content: {
					...prev.content,
					site: {
						...prev.content.site,
						creative: {
							...prev.content.site.creative,
							cursor: undefined,
							cursorImage: file.name,
						},
					},
				},
			}));
		},
		removeCursorImage: () =>
			commitDoc((prev) => {
				const creative = { ...prev.content.site.creative };
				delete creative.cursorImage;
				return {
					...prev,
					cursorImage: { filename: '', assetId: null, sampleAssetId: null },
					content: {
						...prev.content,
						site: {
							...prev.content.site,
							creative: Object.keys(creative).length ? creative : undefined,
						},
					},
				};
			}),

		setCreative: (patch) =>
			patchContent((c) => {
				const merged: CreativeConfig = { ...c.site.creative, ...patch };
				// Keep content.json clean: strip switched-off effects, drop the object when empty.
				if (!merged.cursor) delete merged.cursor;
				if (!merged.cursorImage) delete merged.cursorImage;
				if (!merged.trail) delete merged.trail;
				if (!merged.grain) delete merged.grain;
				if (!merged.clickMark) delete merged.clickMark;
				if (!merged.looseHang) delete merged.looseHang;
				if (!merged.looseHang || !merged.hangStrength) delete merged.hangStrength;
				if (!merged.slowReveal) delete merged.slowReveal;
				if (!merged.artworkWobble) delete merged.artworkWobble;
				if (!merged.colorSpin) delete merged.colorSpin;
				if (!merged.film) delete merged.film;
				if (!merged.pageTransition) delete merged.pageTransition;
				if (!merged.phone || Object.keys(merged.phone).length === 0) delete merged.phone;
				return { ...c, site: { ...c.site, creative: Object.keys(merged).length ? merged : undefined } };
			}),

		setSiteDescription: (value) =>
			patchContent((c) => ({ ...c, site: { ...c.site, description: value } }), true, 'site:description'),
		setSiteLanguage: (value) =>
			patchContent((content) => ({
				...content,
				site: { ...content.site, language: value === 'en' ? undefined : value },
			})),
		setPageDescription: (key, value) =>
			patchPage(key, (page) => ({ ...page, description: value || undefined }), true, `page:${key}:description`),
		setPageBackground: (key, color) =>
			patchPage(key, (page) => ({ ...page, background: color || undefined }), true, `page:${key}:background`),
		setSectionColor: (key, partKey, color) =>
			patchPage(
				key,
				(page) => {
					const next = { ...(page.sectionColors ?? {}) };
					if (color) next[partKey] = color;
					else delete next[partKey];
					return { ...page, sectionColors: Object.keys(next).length ? next : undefined };
				},
				true,
				`page:${key}:sectioncolor:${partKey}`,
			),
		setSectionBleed: (key, partKey, bleed) =>
			patchPage(
				key,
				(page) => {
					const next = { ...(page.sectionBleed ?? {}) };
					if (bleed) next[partKey] = true;
					else delete next[partKey];
					return { ...page, sectionBleed: Object.keys(next).length ? next : undefined };
				},
				true,
				`page:${key}:sectionbleed:${partKey}`,
			),
		setSectionFade: (key, partKey, fade) =>
			patchPage(
				key,
				(page) => {
					const next = { ...(page.sectionFades ?? {}) };
					if (fade) next[partKey] = fade;
					else delete next[partKey];
					return { ...page, sectionFades: Object.keys(next).length ? next : undefined };
				},
				true,
				`page:${key}:sectionfade:${partKey}`,
			),
		setSectionMotion: (key, partKey, motion) =>
			patchPage(
				key,
				(page) => {
					const next = { ...(page.sectionMotion ?? {}) };
					if (motion) next[partKey] = motion;
					else delete next[partKey];
					return {
						...page,
						sectionMotion: Object.keys(next).length ? next : undefined,
					};
				},
				true,
				`page:${key}:sectionmotion:${partKey}`,
			),
		setPageMotion: (key, motion) =>
			patchPage(key, (page) => ({ ...page, motion }), true, `page:${key}:pagemotion`),
		applyPageEffects: (key, source) =>
			patchPage(key, (page) => {
				const sourceBlocks = source.blocks ?? [];
				const sourceTexts = sourceBlocks.filter(
					(block): block is Extract<PageBlock, { type: 'text' }> => block.type === 'text',
				);
				let textIndex = 0;
				const sectionMotion: Record<string, SectionMotionConfig> = {};
				const headingMotion = source.sectionMotion?.['page:heading'];
				if (headingMotion) sectionMotion['page:heading'] = { ...headingMotion };
				const sourceSections = pageSections(source);
				const destinationSections = pageSections(page);
				destinationSections.forEach((section, index) => {
					const sourceSection = sourceSections[index];
					const sourceMotion = sourceSection
						? source.sectionMotion?.[sectionPartKey(sourceSection.id)]
						: undefined;
					if (sourceMotion)
						sectionMotion[sectionPartKey(section.id)] = { ...sourceMotion };
				});
				const blocks = (page.blocks ?? []).map((block, index) => {
					const sourceBlock = sourceBlocks[index];
					if (block.type !== 'text') return block;
					const sourceText =
						sourceBlock?.type === 'text' ? sourceBlock : sourceTexts[textIndex];
					textIndex += 1;
					return {
						...block,
						kinetic: sourceText?.kinetic ? { ...sourceText.kinetic } : undefined,
					};
				});
				return {
					...page,
					blocks,
					headingKinetic: source.headingKinetic ? { ...source.headingKinetic } : undefined,
					sectionMotion: Object.keys(sectionMotion).length ? sectionMotion : undefined,
					motion: source.motion ? { ...source.motion } : undefined,
				};
			}),
		setSectionHeight: (key, partKey, breakpoint, height, viewportHeight, gap, recordHistory = true) =>
			patchPage(
				key,
				(page) => {
					const all = { ...(page.sectionHeights ?? {}) };
					const current = { ...(all[partKey] ?? {}) };
					const viewportKey = breakpoint === 'phone' ? 'phoneVw' : 'desktopVw';
					const gapKey = breakpoint === 'phone' ? 'phoneGap' : 'desktopGap';
					const normalized =
						height === undefined || !Number.isFinite(height)
							? undefined
							: Math.max(0, Math.min(10000, Math.round(height)));
					const normalizedViewport =
						viewportHeight === undefined || !Number.isFinite(viewportHeight)
							? undefined
							: Math.max(0, Math.min(10000, Math.round(viewportHeight * 100) / 100));
					const normalizedGap =
						gap === undefined || !Number.isFinite(gap)
							? undefined
							: Math.max(-400, Math.min(10000, Math.round(gap)));
					if (normalizedGap !== undefined) {
						delete current[breakpoint];
						delete current[viewportKey];
						current[gapKey] = normalizedGap;
					} else {
						delete current[gapKey];
						if (normalized === undefined) delete current[breakpoint];
						else current[breakpoint] = normalized;
						if (normalizedViewport === undefined) delete current[viewportKey];
						else current[viewportKey] = normalizedViewport;
					}
					if (Object.keys(current).length) all[partKey] = current;
					else delete all[partKey];
					return { ...page, sectionHeights: Object.keys(all).length ? all : undefined };
				},
				recordHistory,
				`page:${key}:sectionheight:${partKey}:${breakpoint}`,
			),
		setFooterHeight: (breakpoint, height) =>
			patchContent(
				(content) => {
					const footerHeights = { ...(content.site.footerHeights ?? {}) };
					const normalized =
						height === undefined || !Number.isFinite(height)
							? undefined
							: Math.max(0, Math.min(10000, Math.round(height)));
					if (normalized === undefined) delete footerHeights[breakpoint];
					else footerHeights[breakpoint] = normalized;
					return {
						...content,
						site: {
							...content.site,
							footerHeights: Object.keys(footerHeights).length ? footerHeights : undefined,
						},
					};
				},
				true,
				`site:footerheight:${breakpoint}`,
			),
		setOgImage: (sel) => commitDoc((prev) => ({ ...prev, ogImage: sel })),

		undo: () => {
			lastHistoryAction.current = null;
			const current = docRef.current;
			const previous = undoStack.current.pop();
			if (!previous || !current) return;
			redoStack.current.push({ doc: current, pageKey: historyPageRef.current });
			if (redoStack.current.length > HISTORY_LIMIT) redoStack.current.shift();
			replaceDoc(previous.doc);
			historyPageRef.current = previous.pageKey;
			setHistoryPageKey(previous.pageKey);
			syncHistoryState();
		},
		redo: () => {
			lastHistoryAction.current = null;
			const next = redoStack.current.pop();
			const current = docRef.current;
			if (!next || !current) return;
			undoStack.current.push({ doc: current, pageKey: historyPageRef.current });
			if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
			replaceDoc(next.doc);
			historyPageRef.current = next.pageKey;
			setHistoryPageKey(next.pageKey);
			syncHistoryState();
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- assetsVersion invalidates asset-URL reads
	}), [
		doc,
		hasDraft,
		draftError,
		saveStatus,
		saveError,
		historyState,
		historyPageKey,
		navigateHistoryPage,
		assetsVersion,
		patchContent,
		patchGallery,
		patchPage,
		patchBlocks,
		commitDoc,
		openFresh,
		replaceDoc,
		syncHistoryState,
	]);

	return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
