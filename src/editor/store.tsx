import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { pageGalleryConfigs } from '../lib/content';
import type { ChildrenStyle, Content, CreativeConfig, GalleryConfig, ImageLayout, SignatureData, SocialLink, Theme, PageBlock, PageConfig, TextAlign, TextLayout } from '../lib/content';
import type { EditorDoc, ImageEntry, ImageMeta } from './lib/types';
import { blankDoc, existingDoc, initDocFromContent, upgradeDoc } from './lib/content-init';
import { registerAsset, restoreAsset, subscribeAssets, getAssetsVersion, uid } from './lib/assets';
import { sanitizeFilename } from './lib/validation';
import {
	saveDoc,
	loadDoc as loadSavedDoc,
	hasSavedDoc,
	loadAllAssetBlobs,
	clearPersisted,
} from './lib/persistence';

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
	const next = arr.slice();
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

/** Page keys that can never be minted for a new page (routes/folders the site owns). */
const RESERVED_KEYS = new Set(['home', 'editor', 'demo', 'thumbs', '404']);

/** How many arrangement states Cmd+Z can walk back through. */
const HISTORY_LIMIT = 20;

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
function uniquePageKey(desired: string, pages: Record<string, PageConfig>): string {
	let key = desired;
	for (let n = 2; RESERVED_KEYS.has(key) || key in pages; n++) key = `${desired}-${n}`;
	return key;
}

/** A gallery folder that collides with nothing the document already uses. */
function uniqueFolder(desired: string, doc: EditorDoc): string {
	// 'fonts' and 'thumbs' are special src/assets/ subfolders the exporter owns.
	const taken = new Set(['fonts', 'thumbs', ...Object.keys(doc.content.galleries), ...Object.keys(doc.galleries)]);
	for (const page of Object.values(doc.content.pages))
		for (const config of pageGalleryConfigs(page)) taken.add(config.folder);
	let folder = desired;
	for (let n = 2; taken.has(folder); n++) folder = `${desired}-${n}`;
	return folder;
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
	// lifecycle
	startBlank(): void;
	startExisting(): void;
	/** Start a fresh document from one of the bundled site templates. */
	startTemplate(content: Content): void;
	resumeDraft(): Promise<void>;
	/** Open a fully-formed document (e.g. one loaded from GitHub, assets already registered). */
	openDoc(doc: EditorDoc): void;
	reset(): Promise<void>;
	// profile / contact
	setName(value: string): void;
	setBio(value: string): void;
	setEmail(value: string): void;
	setProfileImage(file: File): void;
	removeProfileImage(): void;
	/** Upload a header logo image (replaces the text logo on every page). */
	setLogoImage(file: File): void;
	removeLogoImage(): void;
	/** Upload the résumé PDF linked from the About section. */
	setResumeFile(file: File): void;
	/** Remove the résumé entirely (no link shown on the site). */
	removeResume(): void;
	// theme
	setTheme(patch: Partial<Theme>): void;
	/** Register an uploaded font file and select it as the site font. */
	addCustomFont(file: File): void;
	removeCustomFont(name: string): void;
	// social
	addSocial(): void;
	updateSocial(index: number, patch: Partial<SocialLink>): void;
	removeSocial(index: number): void;
	moveSocial(from: number, to: number): void;
	// pages
	addPage(label: string): void;
	addChildPage(parentKey: string, label: string): void;
	removePage(key: string): void;
	movePage(from: number, to: number): void;
	/** Reorder a page's sub-pages (changes their card order on the site too). */
	moveChildPage(parentKey: string, from: number, to: number): void;
	renamePage(key: string, label: string): void;
	setPageHeading(key: string, heading: string): void;
	setPageThumb(key: string, file: File): void;
	removePageThumb(key: string): void;
	// page blocks
	addTextBlock(key: string): void;
	updateTextBlock(key: string, blockId: string, text: string): void;
	setTextAlign(key: string, blockId: string, align: TextAlign): void;
	/** Pin a text block to the page canvas (or undefined to return it to the flow). */
	setTextLayout(key: string, blockId: string, layout: TextLayout | undefined): void;
	/** Change gallery display settings (freeform/grid, columns, crop aspect). */
	setGalleryConfig(key: string, patch: Partial<Pick<GalleryConfig, 'layout' | 'columns' | 'aspect'>>): void;
	/** Add an extra image group (its own folder + canvas/grid) to the page. */
	addImagesBlock(key: string): void;
	/** Change an image group's display settings (freeform/grid, columns, crop aspect). */
	updateImagesBlock(key: string, blockId: string, patch: Partial<Pick<GalleryConfig, 'layout' | 'columns' | 'aspect'>>): void;
	/** Give an image group a display name (shown in the editor so groups are tellable apart). */
	renameImagesBlock(key: string, blockId: string, name: string): void;
	/** Choose how a page's sub-pages are presented (cards, big covers, list, text index). */
	setChildrenStyle(key: string, blockId: string, style: ChildrenStyle): void;
	/** Store the hand-drawn signature (undefined clears it off the site). */
	setSignature(data: SignatureData | undefined): void;
	/** Footer text shown at the bottom of every page (empty removes the footer). */
	setFooter(value: string): void;
	addEmbedBlock(key: string): void;
	updateEmbedBlock(key: string, blockId: string, url: string): void;
	/** Pin a video embed to the page canvas (or undefined to return it to the flow). */
	setEmbedLayout(key: string, blockId: string, layout: ImageLayout | undefined): void;
	removeBlock(key: string, blockId: string): void;
	moveBlock(key: string, from: number, to: number): void;
	// galleries
	addGalleryImages(folder: string, files: File[]): void;
	removeGalleryImage(folder: string, id: string): void;
	moveGalleryImage(folder: string, from: number, to: number): void;
	updateGalleryMeta(folder: string, id: string, patch: Partial<ImageMeta>): void;
	/** Overwrite many images' freeform positions at once (id -> layout), e.g. when
	 *  adopting the Grid arrangement as the freeform starting point. */
	setGalleryLayouts(folder: string, layouts: Record<string, ImageLayout>): void;
	// creative extras
	/** Optional site-wide flourishes configured in the Fun tab. */
	setCreative(patch: Partial<CreativeConfig>): void;
	// sharing / SEO
	/** Meta description used for search results and social link previews. */
	setSiteDescription(value: string): void;
	/** Per-page meta description (empty falls back to the site description). */
	setPageDescription(key: string, value: string): void;
	/** Pick which uploaded image social cards use (undefined = automatic). */
	setOgImage(sel: { folder: string; entryId: string } | undefined): void;
	// history (canvas arrangements)
	/** Undo the last recorded image/video arrangement change (Cmd+Z). */
	undo(): void;
	/** Redo an undone arrangement change (Cmd+Y / Cmd+Shift+Z). */
	redo(): void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
	const ctx = useContext(EditorContext);
	if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
	return ctx;
}

export function EditorProvider({ children }: { children: React.ReactNode }) {
	const [doc, setDoc] = useState<EditorDoc | null>(null);
	const [hasDraft, setHasDraft] = useState<boolean>(() => hasSavedDoc());
	// Downscaled asset previews finish async; bumping this re-renders every consumer
	// so getAssetPreviewUrl() calls pick up the light copies.
	const assetsVersion = useSyncExternalStore(subscribeAssets, getAssetsVersion, getAssetsVersion);

	// Undo/redo for canvas arrangements: snapshots of the doc taken right before a
	// recorded change. Refs, not state — pushing history must never re-render.
	const undoStack = useRef<EditorDoc[]>([]);
	const redoStack = useRef<EditorDoc[]>([]);
	const record = useCallback((prev: EditorDoc) => {
		undoStack.current.push(prev);
		if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
		redoStack.current = [];
	}, []);

	// Autosave (debounced) whenever the document changes.
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => {
		if (!doc) return;
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => saveDoc(doc), 400);
		return () => window.clearTimeout(timer.current);
	}, [doc]);

	// --- helpers to update nested content immutably ---
	const patchContent = useCallback((fn: (c: Content) => Content) => {
		setDoc((prev) => (prev ? { ...prev, content: fn(prev.content) } : prev));
	}, []);
	const patchGallery = useCallback((folder: string, fn: (entries: ImageEntry[]) => ImageEntry[]) => {
		setDoc((prev) => (prev ? { ...prev, galleries: { ...prev.galleries, [folder]: fn(prev.galleries[folder] ?? []) } } : prev));
	}, []);
	const patchPage = useCallback(
		(key: string, fn: (page: PageConfig) => PageConfig) => {
			patchContent((c) =>
				c.pages[key] ? { ...c, pages: { ...c.pages, [key]: fn(c.pages[key]) } } : c,
			);
		},
		[patchContent],
	);
	const patchBlocks = useCallback(
		(key: string, fn: (blocks: PageBlock[]) => PageBlock[]) => {
			patchPage(key, (page) => ({ ...page, blocks: fn(page.blocks ?? []) }));
		},
		[patchPage],
	);

	// Fresh documents start with a clean history.
	const openFresh = useCallback((next: EditorDoc | null) => {
		undoStack.current = [];
		redoStack.current = [];
		setDoc(next);
	}, []);

	const value = useMemo<EditorContextValue>(() => ({
		doc,
		hasDraft,

		startBlank: () => openFresh(blankDoc()),
		startExisting: () => openFresh(existingDoc()),
		startTemplate: (content) => openFresh(initDocFromContent(content)),
		resumeDraft: async () => {
			const stored = await loadAllAssetBlobs();
			for (const a of stored) restoreAsset(a.id, a.blob, a.filename);
			const saved = loadSavedDoc();
			if (saved) openFresh(upgradeDoc(saved));
			else openFresh(existingDoc());
		},
		openDoc: (next: EditorDoc) => {
			setHasDraft(true);
			openFresh(upgradeDoc(next));
		},
		reset: async () => {
			await clearPersisted();
			setHasDraft(false);
			openFresh(null);
		},

		setName: (value) => patchContent((c) => ({ ...c, site: { ...c.site, name: value } })),
		setBio: (value) => patchContent((c) => ({ ...c, profile: { ...c.profile, bio: value } })),
		setEmail: (value) => patchContent((c) => ({ ...c, contact: { ...c.contact, email: value } })),

		setProfileImage: (file) => {
			const assetId = registerAsset(file, file.name);
			setDoc((prev) => (prev ? { ...prev, profileImage: { filename: file.name, assetId } } : prev));
		},
		removeProfileImage: () => setDoc((prev) => (prev ? { ...prev, profileImage: { filename: '', assetId: null } } : prev)),

		setLogoImage: (file) => {
			const assetId = registerAsset(file, file.name);
			setDoc((prev) => (prev ? { ...prev, logoImage: { filename: file.name, assetId } } : prev));
		},
		removeLogoImage: () =>
			setDoc((prev) =>
				prev
					? {
							...prev,
							logoImage: { filename: '', assetId: null },
							content: { ...prev.content, site: { ...prev.content.site, logoImage: undefined } },
						}
					: prev,
			),

		setResumeFile: (file) => {
			const assetId = registerAsset(file, file.name);
			setDoc((prev) =>
				prev
					? {
							...prev,
							resumeFile: { filename: file.name, assetId },
							content: {
								...prev.content,
								resume: { label: prev.content.resume?.label || 'Résumé', url: sanitizeFilename(file.name) },
							},
						}
					: prev,
			);
		},
		removeResume: () =>
			setDoc((prev) =>
				prev
					? {
							...prev,
							resumeFile: { filename: '', assetId: null },
							content: { ...prev.content, resume: { label: prev.content.resume?.label || 'Résumé', url: '' } },
						}
					: prev,
			),

		setTheme: (patch) => patchContent((c) => ({ ...c, theme: { ...c.theme, ...patch } })),

		addCustomFont: (file) => {
			const name = fontNameFromFile(file.name);
			const assetId = registerAsset(file, file.name);
			setDoc((prev) => {
				if (!prev) return prev;
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
					fonts: { ...prev.fonts, [name]: { filename: file.name, assetId } },
				};
			});
		},
		removeCustomFont: (name) =>
			setDoc((prev) => {
				if (!prev) return prev;
				const customFonts = (prev.content.theme.customFonts ?? []).filter((f) => f.name !== name);
				const fonts = { ...prev.fonts };
				delete fonts[name];
				const usesIt = prev.content.theme.fontFamily.includes(`"${name}"`);
				const headingUsesIt = prev.content.theme.headingFontFamily?.includes(`"${name}"`) ?? false;
				return {
					...prev,
					content: {
						...prev.content,
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
			patchContent((c) => ({ ...c, social: c.social.map((s, i) => (i === index ? { ...s, ...patch } : s)) })),
		removeSocial: (index) => patchContent((c) => ({ ...c, social: c.social.filter((_, i) => i !== index) })),
		moveSocial: (from, to) => patchContent((c) => ({ ...c, social: arrayMove(c.social, from, to) })),

		// ---- pages ----
		addPage: (label) =>
			setDoc((prev) => {
				if (!prev) return prev;
				const key = uniquePageKey(slugify(label), prev.content.pages);
				const name = label.trim() || 'New page';
				const page: PageConfig = {
					title: `${name} — {name}`,
					label: name,
					gallery: { folder: key, alt: name, order: 'asc' },
					blocks: [{ id: 'gallery', type: 'gallery' }],
				};
				return {
					...prev,
					content: {
						...prev.content,
						nav: [...prev.content.nav, { path: key, label: name }],
						pages: { ...prev.content.pages, [key]: page },
						galleries: { ...prev.content.galleries, [key]: { items: {} } },
					},
					galleries: { ...prev.galleries, [key]: [] },
				};
			}),

		addChildPage: (parentKey, label) =>
			setDoc((prev) => {
				if (!prev || !prev.content.pages[parentKey]) return prev;
				const desired = parentKey === 'home' ? slugify(label) : `${parentKey}/${slugify(label)}`;
				const key = uniquePageKey(desired, prev.content.pages);
				const folder = key.replace(/\//g, '-');
				const name = label.trim() || 'New page';
				const page: PageConfig = {
					title: `${name} — {name}`,
					label: name,
					gallery: { folder, alt: name, order: 'asc' },
					blocks: [{ id: 'gallery', type: 'gallery' }],
				};
				const parent = prev.content.pages[parentKey];
				const parentBlocks = parent.blocks ?? [];
				return {
					...prev,
					content: {
						...prev.content,
						pages: {
							...prev.content.pages,
							[key]: page,
							[parentKey]: {
								...parent,
								children: [...(parent.children ?? []), key],
								blocks: parentBlocks.some((b) => b.type === 'children')
									? parentBlocks
									: [...parentBlocks, { id: 'children', type: 'children' }],
							},
						},
						galleries: { ...prev.content.galleries, [folder]: { items: {} } },
					},
					galleries: { ...prev.galleries, [folder]: [] },
				};
			}),

		removePage: (key) =>
			setDoc((prev) => {
				if (!prev || key === 'home' || !prev.content.pages[key]) return prev;
				const doomed = [key, ...(prev.content.pages[key].children ?? [])];
				const doomedFolders = doomed.flatMap((k) => {
					const page = prev.content.pages[k];
					return page ? pageGalleryConfigs(page).map((g) => g.folder) : [];
				});

				const pages: Record<string, PageConfig> = {};
				for (const [k, page] of Object.entries(prev.content.pages)) {
					if (doomed.includes(k)) continue;
					if (page.children?.includes(key)) {
						const children = page.children.filter((c) => c !== key);
						pages[k] = {
							...page,
							children,
							blocks: children.length ? page.blocks : page.blocks?.filter((b) => b.type !== 'children'),
						};
					} else pages[k] = page;
				}
				const contentGalleries = { ...prev.content.galleries };
				const docGalleries = { ...prev.galleries };
				for (const folder of doomedFolders) {
					delete contentGalleries[folder];
					delete docGalleries[folder];
				}
				const pageThumbs = { ...prev.pageThumbs };
				for (const k of doomed) delete pageThumbs[k];

				return {
					...prev,
					content: {
						...prev.content,
						nav: prev.content.nav.filter((item) => item.path !== key),
						pages,
						galleries: contentGalleries,
					},
					galleries: docGalleries,
					pageThumbs,
				};
			}),

		movePage: (from, to) => patchContent((c) => ({ ...c, nav: arrayMove(c.nav, from, to) })),

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
			}),

		setPageHeading: (key, heading) => patchPage(key, (page) => ({ ...page, heading: heading || undefined })),

		setPageThumb: (key, file) => {
			const assetId = registerAsset(file, file.name);
			setDoc((prev) =>
				prev ? { ...prev, pageThumbs: { ...prev.pageThumbs, [key]: { filename: file.name, assetId } } } : prev,
			);
		},
		removePageThumb: (key) =>
			setDoc((prev) => {
				if (!prev) return prev;
				const pageThumbs = { ...prev.pageThumbs };
				delete pageThumbs[key];
				const page = prev.content.pages[key];
				const pages = page ? { ...prev.content.pages, [key]: { ...page, thumbnail: undefined } } : prev.content.pages;
				return { ...prev, pageThumbs, content: { ...prev.content, pages } };
			}),

		// ---- page blocks ----
		addTextBlock: (key) => patchBlocks(key, (blocks) => [...blocks, { id: uid('t'), type: 'text', text: '' }]),
		updateTextBlock: (key, blockId, text) =>
			patchBlocks(key, (blocks) => blocks.map((b) => (b.id === blockId && b.type === 'text' ? { ...b, text } : b))),
		setTextAlign: (key, blockId, align) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'text' ? { ...b, align: align === 'left' ? undefined : align } : b,
				),
			),
		setTextLayout: (key, blockId, layout) => {
			// Record real placement changes only — the preview re-commits text heights
			// (h) after every render measure, and those must not flood the history.
			const block = doc?.content.pages[key]?.blocks?.find((b) => b.id === blockId);
			const old = block?.type === 'text' ? block.layout : undefined;
			const moved = !layout || !old || old.x !== layout.x || old.y !== layout.y || old.w !== layout.w;
			if (doc && moved) record(doc);
			patchBlocks(key, (blocks) =>
				blocks.map((b) => (b.id === blockId && b.type === 'text' ? { ...b, layout } : b)),
			);
		},
		setGalleryConfig: (key, patch) =>
			patchPage(key, (page) => (page.gallery ? { ...page, gallery: { ...page.gallery, ...patch } } : page)),
		addImagesBlock: (key) =>
			setDoc((prev) => {
				if (!prev) return prev;
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
						pages: { ...prev.content.pages, [key]: { ...page, blocks: [...(page.blocks ?? []), block] } },
						galleries: { ...prev.content.galleries, [folder]: { items: {} } },
					},
					galleries: { ...prev.galleries, [folder]: [] },
				};
			}),
		updateImagesBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'images' ? { ...b, gallery: { ...b.gallery, ...patch } } : b,
				),
			),
		renameImagesBlock: (key, blockId, name) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'images' ? { ...b, name: name || undefined } : b,
				),
			),
		setChildrenStyle: (key, blockId, style) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'children'
						? { ...b, style: style === 'cards' ? undefined : style }
						: b,
				),
			),
		setSignature: (data) => patchContent((c) => ({ ...c, site: { ...c.site, signature: data } })),
		setFooter: (value) => patchContent((c) => ({ ...c, site: { ...c.site, footer: value || undefined } })),
		addEmbedBlock: (key) => patchBlocks(key, (blocks) => [...blocks, { id: uid('v'), type: 'embed', url: '' }]),
		updateEmbedBlock: (key, blockId, url) =>
			patchBlocks(key, (blocks) => blocks.map((b) => (b.id === blockId && b.type === 'embed' ? { ...b, url } : b))),
		setEmbedLayout: (key, blockId, layout) => {
			if (doc) record(doc); // moving/pinning a video is undoable like an image move
			patchBlocks(key, (blocks) =>
				blocks.map((b) => (b.id === blockId && b.type === 'embed' ? { ...b, layout } : b)),
			);
		},
		removeBlock: (key, blockId) =>
			setDoc((prev) => {
				if (!prev) return prev;
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((b) => b.id === blockId);
				const blocks = (page.blocks ?? []).filter((b) => b.id !== blockId);
				const next = {
					...prev,
					content: { ...prev.content, pages: { ...prev.content.pages, [key]: { ...page, blocks } } },
				};
				// Removing an image group takes its folder (and images) off the site too.
				if (target?.type === 'images') {
					const contentGalleries = { ...next.content.galleries };
					delete contentGalleries[target.gallery.folder];
					next.content = { ...next.content, galleries: contentGalleries };
					const docGalleries = { ...prev.galleries };
					delete docGalleries[target.gallery.folder];
					next.galleries = docGalleries;
				}
				return next;
			}),
		moveBlock: (key, from, to) => patchBlocks(key, (blocks) => arrayMove(blocks, from, to)),

		addGalleryImages: (folder, files) =>
			patchGallery(folder, (entries) => [
				...entries,
				...files.map((file) => ({
					id: uid('e'),
					filename: file.name,
					meta: { title: '', description: '', link: '' },
					assetId: registerAsset(file, file.name),
				})),
			]),
		removeGalleryImage: (folder, id) => patchGallery(folder, (entries) => entries.filter((e) => e.id !== id)),
		moveGalleryImage: (folder, from, to) => patchGallery(folder, (entries) => arrayMove(entries, from, to)),
		updateGalleryMeta: (folder, id, patch) => {
			// An image MOVE is undoable; the first layout an image ever gets is the
			// auto-flow commit (not a user action), so only record replacements.
			if (patch.layout && doc?.galleries[folder]?.find((e) => e.id === id)?.meta.layout) record(doc);
			patchGallery(folder, (entries) => entries.map((e) => (e.id === id ? { ...e, meta: { ...e.meta, ...patch } } : e)));
		},
		setGalleryLayouts: (folder, layouts) => {
			if (doc) record(doc);
			patchGallery(folder, (entries) =>
				entries.map((e) => (layouts[e.id] ? { ...e, meta: { ...e.meta, layout: layouts[e.id] } } : e)),
			);
		},

		setCreative: (patch) =>
			patchContent((c) => {
				const merged: CreativeConfig = { ...c.site.creative, ...patch };
				// Keep content.json clean: strip switched-off effects, drop the object when empty.
				if (!merged.cursor) delete merged.cursor;
				if (!merged.trail) delete merged.trail;
				if (!merged.grain) delete merged.grain;
				if (!merged.clickMark) delete merged.clickMark;
				if (!merged.looseHang) delete merged.looseHang;
				if (!merged.slowReveal) delete merged.slowReveal;
				if (!merged.artworkWobble) delete merged.artworkWobble;
				if (!merged.colorSpin) delete merged.colorSpin;
				return { ...c, site: { ...c.site, creative: Object.keys(merged).length ? merged : undefined } };
			}),

		setSiteDescription: (value) => patchContent((c) => ({ ...c, site: { ...c.site, description: value } })),
		setPageDescription: (key, value) => patchPage(key, (page) => ({ ...page, description: value || undefined })),
		setOgImage: (sel) => setDoc((prev) => (prev ? { ...prev, ogImage: sel } : prev)),

		undo: () => {
			const prev = undoStack.current.pop();
			if (!prev || !doc) return;
			redoStack.current.push(doc);
			setDoc(prev);
		},
		redo: () => {
			const next = redoStack.current.pop();
			if (!next || !doc) return;
			undoStack.current.push(doc);
			setDoc(next);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- assetsVersion invalidates asset-URL reads
	}), [doc, hasDraft, assetsVersion, patchContent, patchGallery, patchPage, patchBlocks, record, openFresh]);

	return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
