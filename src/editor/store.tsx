import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { pageGalleryConfigs } from '../lib/content';
import type {
	ChildrenStyle,
	Content,
	CreativeConfig,
	GalleryConfig,
	ImageLayout,
	MobileComposition,
	SignatureData,
	SocialLink,
	Theme,
	PageBlock,
	PageConfig,
	TextAlign,
	TextLayout,
	TextStyle,
} from '../lib/content';
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
import { DEFAULT_AR, flowMissing } from '../portfolio/canvasLayout';
import { automaticPhoneOrder, type PhoneCanvasPosition } from '../portfolio/mobileOrder';

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
	const next = arr.slice();
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

/** Page keys that can never be minted for a new page (routes/folders the site owns). */
const RESERVED_KEYS = new Set(['home', 'editor', 'demo', 'thumbs', '404']);

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

function referencedGalleryFolders(pages: Record<string, PageConfig>): Set<string> {
	return new Set(Object.values(pages).flatMap((page) => pageGalleryConfigs(page).map((gallery) => gallery.folder)));
}

function referencedAssetIds(doc: EditorDoc): Set<string> {
	const ids = new Set<string>();
	for (const entries of Object.values(doc.galleries))
		for (const entry of entries) if (entry.assetId) ids.add(entry.assetId);
	for (const slot of [doc.profileImage, doc.logoImage, doc.resumeFile, ...Object.values(doc.pageThumbs), ...Object.values(doc.fonts)])
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

function pageHasCanvas(page: PageConfig): boolean {
	return !!page.gallery && page.gallery.layout !== 'grid' && (page.blocks ?? []).some((block) => block.type === 'gallery');
}

function automaticPagePhoneKeys(page: PageConfig): string[] {
	const canvas = pageHasCanvas(page);
	return [
		...(page.heading?.trim() ? ['page:heading'] : []),
		...(page.blocks ?? []).flatMap((block) =>
			canvas && (block.type === 'text' || block.type === 'embed') && block.layout ? [] : [`block:${block.id}`],
		),
	];
}

function automaticGalleryPhoneKeys(doc: EditorDoc, page: PageConfig): string[] {
	if (!page.gallery) return [];
	const entries = doc.galleries[page.gallery.folder] ?? [];
	if (page.gallery.layout === 'grid') return entries.map((entry) => `image:${entry.id}`);
	const flowed = flowMissing(
		entries.map((entry) => ({ layout: entry.meta.layout, ar: entry.meta.layout?.ar ?? DEFAULT_AR })),
	);
	const blocks = page.blocks ?? [];
	const positions: PhoneCanvasPosition[] = entries.map((entry, index) => ({
			key: `image:${entry.id}`,
			y: entry.meta.layout?.y ?? flowed.get(index)?.y ?? index * 30,
			kind: 'image',
			index,
		}));
	blocks.forEach((block, index) => {
		if (block.type === 'text' && block.layout)
			positions.push({ key: `text:${block.id}`, y: block.layout.y, kind: 'text', index });
		if (block.type === 'embed' && block.layout)
			positions.push({ key: `video:${block.id}`, y: block.layout.y, kind: 'video', index });
	});
	return automaticPhoneOrder(positions);
}

/** Move one logical phone choice when a desktop edit moves a text/video block
 * into or out of the main canvas. Hidden/size/order intent follows the item. */
function transferPhoneItem(
	source: MobileComposition | undefined,
	sourceKey: string,
	destination: MobileComposition | undefined,
	destinationKey: string,
	destinationSeed: readonly string[],
): { source: MobileComposition | undefined; destination: MobileComposition | undefined } {
	if (!source) return { source, destination };
	const sourceIndex = source.order.indexOf(sourceKey);
	const sourceStyle = source.items?.[sourceKey];
	if (sourceIndex < 0 && !sourceStyle) return { source, destination };

	const sourceOrder = source.order.filter((key) => key !== sourceKey);
	const sourceItems = { ...source.items };
	delete sourceItems[sourceKey];
	const nextSource: MobileComposition = {
		...source,
		order: sourceOrder,
		items: Object.keys(sourceItems).length ? sourceItems : undefined,
	};

	const seeded = destination
		? [...destination.order, ...destinationSeed.filter((key) => !destination.order.includes(key))]
		: [...destinationSeed];
	const destinationOrder = seeded.filter((key) => key !== destinationKey);
	const ratio = sourceIndex < 0 || source.order.length <= 1 ? 1 : sourceIndex / (source.order.length - 1);
	const insertAt = Math.min(destinationOrder.length, Math.max(0, Math.round(ratio * destinationOrder.length)));
	destinationOrder.splice(insertAt, 0, destinationKey);
	const destinationItems = { ...destination?.items };
	if (sourceStyle) destinationItems[destinationKey] = sourceStyle;
	else delete destinationItems[destinationKey];
	const nextDestination: MobileComposition = {
		...(destination ?? { mode: 'custom' as const, order: [] }),
		order: destinationOrder,
		items: Object.keys(destinationItems).length ? destinationItems : undefined,
	};
	return { source: nextSource, destination: nextDestination };
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
	setPageThumb(key: string, file: File): void;
	removePageThumb(key: string): void;
	// page blocks
	addTextBlock(key: string): void;
	updateTextBlock(key: string, blockId: string, text: string): void;
	setTextAlign(key: string, blockId: string, align: TextAlign): void;
	setTextStyle(key: string, blockId: string, style: TextStyle): void;
	setTextLink(key: string, blockId: string, link: string): void;
	/** Pin a text block to the page canvas (or undefined to return it to the flow). */
	setTextLayout(key: string, blockId: string, layout: TextLayout | undefined): void;
	/** Change gallery display settings (freeform/grid, columns, crop aspect). */
	setGalleryConfig(key: string, patch: Partial<Pick<GalleryConfig, 'layout' | 'columns' | 'aspect' | 'mobile'>>): void;
	/** Add an extra image group (its own folder + canvas/grid) to the page. */
	addImagesBlock(key: string): void;
	/** Change an image group's display settings (freeform/grid, columns, crop aspect). */
	updateImagesBlock(key: string, blockId: string, patch: Partial<Pick<GalleryConfig, 'layout' | 'columns' | 'aspect' | 'mobile'>>): void;
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
	addButtonBlock(key: string): void;
	updateButtonBlock(
		key: string,
		blockId: string,
		patch: Partial<{ label: string; url: string; align: TextAlign; appearance: 'solid' | 'outline' }>,
	): void;
	addDividerBlock(key: string): void;
	addFormBlock(key: string): void;
	updateFormBlock(
		key: string,
		blockId: string,
		patch: Partial<Extract<PageBlock, { type: 'form' }>>,
	): void;
	removeBlock(key: string, blockId: string): void;
	moveBlock(key: string, from: number, to: number): void;
	// galleries
	addGalleryImages(folder: string, files: File[]): void;
	/** Swap an uploaded image while preserving its caption, placement and stable id. */
	replaceGalleryImage(folder: string, id: string, file: File): void;
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
	/** Language browsers and screen readers should use for this site. */
	setSiteLanguage(value: string): void;
	/** Per-page meta description (empty falls back to the site description). */
	setPageDescription(key: string, value: string): void;
	/** Pick which uploaded image social cards use (undefined = automatic). */
	setOgImage(sel: { folder: string; entryId: string } | undefined): void;
	// history
	canUndo: boolean;
	canRedo: boolean;
	/** Undo the last document change (Cmd+Z). */
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

export function EditorProvider({ children }: { children: React.ReactNode }) {
	const [doc, setDocState] = useState<EditorDoc | null>(null);
	// Event handlers can make more than one change before React renders. Keep the
	// latest committed document in a ref so the second change builds on the first.
	const docRef = useRef<EditorDoc | null>(null);
	const [hasDraft, setHasDraft] = useState<boolean>(() => hasSavedDoc());
	const [draftError, setDraftError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
	const [saveError, setSaveError] = useState<string | null>(null);
	const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
	// Downscaled asset previews finish async; bumping this re-renders every consumer
	// so getAssetPreviewUrl() calls pick up the light copies.
	const assetsVersion = useSyncExternalStore(subscribeAssets, getAssetsVersion, getAssetsVersion);

	// Full-document snapshots taken immediately before each user-visible change.
	// The stacks stay in refs; only the two availability flags enter React state.
	const undoStack = useRef<EditorDoc[]>([]);
	const redoStack = useRef<EditorDoc[]>([]);
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
			undoStack.current.push(prev);
			if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
		}
		redoStack.current = [];
		lastHistoryAction.current = actionKey ? { key: actionKey, at: now } : null;
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
	}, [doc, assetsVersion]);

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
		setBio: (value) => patchContent((c) => ({ ...c, profile: { ...c.profile, bio: value } }), true, 'profile:bio'),
		setEmail: (value) => patchContent((c) => ({ ...c, contact: { ...c.contact, email: value } }), true, 'contact:email'),

		setProfileImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({ ...prev, profileImage: { filename: file.name, assetId } }));
		},
		removeProfileImage: () => commitDoc((prev) => ({ ...prev, profileImage: { filename: '', assetId: null } })),

		setLogoImage: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({ ...prev, logoImage: { filename: file.name, assetId } }));
		},
		removeLogoImage: () =>
			commitDoc((prev) => ({
				...prev,
				logoImage: { filename: '', assetId: null },
				content: { ...prev.content, site: { ...prev.content.site, logoImage: undefined } },
			})),

		setResumeFile: (file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				resumeFile: { filename: file.name, assetId },
				content: {
					...prev.content,
					resume: { label: prev.content.resume?.label || 'Résumé', url: sanitizeFilename(file.name) },
				},
			}));
		},
		removeResume: () =>
			commitDoc((prev) => ({
				...prev,
				resumeFile: { filename: '', assetId: null },
				content: { ...prev.content, resume: { label: prev.content.resume?.label || 'Résumé', url: '' } },
			})),

		setTheme: (patch) =>
			patchContent(
				(c) => ({ ...c, theme: { ...c.theme, ...patch } }),
				true,
				`theme:${Object.keys(patch).sort().join(',')}`,
			),

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
					fonts: { ...prev.fonts, [name]: { filename: file.name, assetId } },
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
			patchContent(
				(c) => ({ ...c, social: c.social.map((s, i) => (i === index ? { ...s, ...patch } : s)) }),
				true,
				`social:${index}:${Object.keys(patch).sort().join(',')}`,
			),
		removeSocial: (index) => patchContent((c) => ({ ...c, social: c.social.filter((_, i) => i !== index) })),
		moveSocial: (from, to) => patchContent((c) => ({ ...c, social: arrayMove(c.social, from, to) })),

		// ---- pages ----
		addPage: (label) =>
			commitDoc((prev) => {
				const key = uniquePageKey(slugify(label), prev.content.pages);
				const folder = uniqueFolder(key, prev);
				const name = label.trim() || 'New page';
				const page: PageConfig = {
					title: `${name} — {name}`,
					label: name,
					gallery: { folder, alt: name, order: 'asc' },
					blocks: [{ id: 'gallery', type: 'gallery' }],
				};
				return {
					...prev,
					content: {
						...prev.content,
						nav: [...prev.content.nav, { path: key, label: name }],
						pages: { ...prev.content.pages, [key]: page },
						galleries: { ...prev.content.galleries, [folder]: { items: {} } },
					},
					galleries: { ...prev.galleries, [folder]: [] },
				};
			}),

		addChildPage: (parentKey, label) =>
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
					if (page.children?.some((child) => doomed.has(child))) {
						const children = page.children.filter((child) => !doomed.has(child));
						const removedChildBlocks = children.length
							? []
							: (page.blocks ?? []).filter((block) => block.type === 'children').map((block) => block.id);
						pages[k] = {
							...page,
							children,
							blocks: children.length ? page.blocks : page.blocks?.filter((b) => b.type !== 'children'),
							mobile: withoutPhonePageBlocks(page.mobile, removedChildBlocks),
						};
					} else pages[k] = page;
				}
				const contentGalleries = { ...prev.content.galleries };
				const docGalleries = { ...prev.galleries };
				const stillUsed = referencedGalleryFolders(pages);
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
				const page: PageConfig = {
					...source,
					label,
					title: `${label} — {name}`,
					draft: true,
					children: undefined,
					blocks,
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
							if (block.type === 'text' && block.link) return { ...block, link: rewriteInternalLink(block.link) };
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

		setPageThumb: (key, file) => {
			const assetId = registerAsset(file, file.name);
			commitDoc((prev) => ({
				...prev,
				pageThumbs: { ...prev.pageThumbs, [key]: { filename: file.name, assetId } },
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
		addTextBlock: (key) => patchBlocks(key, (blocks) => [...blocks, { id: uid('t'), type: 'text', text: '' }]),
		updateTextBlock: (key, blockId, text) =>
			patchBlocks(
				key,
				(blocks) => blocks.map((b) => (b.id === blockId && b.type === 'text' ? { ...b, text } : b)),
				true,
				`page:${key}:text:${blockId}`,
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
		setTextLayout: (key, blockId, layout) => {
			// Record real placement changes only. The preview re-commits text heights
			// after measuring the rendered text; height-only corrections are automatic.
			const block = docRef.current?.content.pages[key]?.blocks?.find((b) => b.id === blockId);
			const old = block?.type === 'text' ? block.layout : undefined;
			const moved = layout
				? !old || old.x !== layout.x || old.y !== layout.y || old.w !== layout.w
				: old !== undefined;
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((candidate) => candidate.id === blockId);
				if (!target || target.type !== 'text') return prev;
				const wasPinned = pageHasCanvas(page) && !!target.layout;
				const blocks = (page.blocks ?? []).map((candidate) =>
					candidate.id === blockId && candidate.type === 'text' ? { ...candidate, layout } : candidate,
				);
				let nextPage: PageConfig = { ...page, blocks };
				const isPinned = pageHasCanvas(nextPage) && !!layout;
				if (wasPinned !== isPinned && nextPage.gallery) {
					if (isPinned) {
						const movedChoice = transferPhoneItem(
							nextPage.mobile,
							`block:${blockId}`,
							nextPage.gallery.mobile,
							`text:${blockId}`,
							automaticGalleryPhoneKeys(prev, nextPage),
						);
						nextPage = {
							...nextPage,
							mobile: movedChoice.source,
							gallery: { ...nextPage.gallery, mobile: movedChoice.destination },
						};
					} else {
						const movedChoice = transferPhoneItem(
							nextPage.gallery.mobile,
							`text:${blockId}`,
							nextPage.mobile,
							`block:${blockId}`,
							automaticPagePhoneKeys(nextPage),
						);
						nextPage = {
							...nextPage,
							mobile: movedChoice.destination,
							gallery: { ...nextPage.gallery, mobile: movedChoice.source },
						};
					}
				}
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}, moved);
		},
		setGalleryConfig: (key, patch) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page?.gallery) return prev;
				const wasCanvas = pageHasCanvas(page);
				let nextPage: PageConfig = { ...page, gallery: { ...page.gallery, ...patch } };
				const isCanvas = pageHasCanvas(nextPage);
				if (wasCanvas !== isCanvas && nextPage.gallery) {
					for (const block of nextPage.blocks ?? []) {
						if ((block.type !== 'text' && block.type !== 'embed') || !block.layout) continue;
						const canvasKey = `${block.type === 'text' ? 'text' : 'video'}:${block.id}`;
						const pageKey = `block:${block.id}`;
						const gallery = nextPage.gallery;
						if (!gallery) break;
						if (isCanvas) {
							const movedChoice = transferPhoneItem(
								nextPage.mobile,
								pageKey,
								gallery.mobile,
								canvasKey,
								automaticGalleryPhoneKeys(prev, nextPage),
							);
							nextPage = { ...nextPage, mobile: movedChoice.source, gallery: { ...gallery, mobile: movedChoice.destination } };
						} else {
							const movedChoice = transferPhoneItem(
								gallery.mobile,
								canvasKey,
								nextPage.mobile,
								pageKey,
								automaticPagePhoneKeys(nextPage),
							);
							nextPage = { ...nextPage, mobile: movedChoice.destination, gallery: { ...gallery, mobile: movedChoice.source } };
						}
					}
				}
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}),
		addImagesBlock: (key) =>
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
			true, `page:${key}:image-group-name:${blockId}`),
		setChildrenStyle: (key, blockId, style) =>
			patchBlocks(key, (blocks) =>
				blocks.map((b) =>
					b.id === blockId && b.type === 'children'
						? { ...b, style: style === 'cards' ? undefined : style }
						: b,
				),
			),
		setSignature: (data) => patchContent((c) => ({ ...c, site: { ...c.site, signature: data } })),
		setFooter: (value) =>
			patchContent((c) => ({ ...c, site: { ...c.site, footer: value || undefined } }), true, 'site:footer'),
		addEmbedBlock: (key) => patchBlocks(key, (blocks) => [...blocks, { id: uid('v'), type: 'embed', url: '' }]),
		updateEmbedBlock: (key, blockId, url) =>
			patchBlocks(
				key,
				(blocks) => blocks.map((b) => (b.id === blockId && b.type === 'embed' ? { ...b, url } : b)),
				true,
				`page:${key}:video:${blockId}`,
			),
		setEmbedLayout: (key, blockId, layout) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((candidate) => candidate.id === blockId);
				if (!target || target.type !== 'embed') return prev;
				const wasPinned = pageHasCanvas(page) && !!target.layout;
				const blocks = (page.blocks ?? []).map((candidate) =>
					candidate.id === blockId && candidate.type === 'embed' ? { ...candidate, layout } : candidate,
				);
				let nextPage: PageConfig = { ...page, blocks };
				const isPinned = pageHasCanvas(nextPage) && !!layout;
				if (wasPinned !== isPinned && nextPage.gallery) {
					if (isPinned) {
						const movedChoice = transferPhoneItem(
							nextPage.mobile,
							`block:${blockId}`,
							nextPage.gallery.mobile,
							`video:${blockId}`,
							automaticGalleryPhoneKeys(prev, nextPage),
						);
						nextPage = { ...nextPage, mobile: movedChoice.source, gallery: { ...nextPage.gallery, mobile: movedChoice.destination } };
					} else {
						const movedChoice = transferPhoneItem(
							nextPage.gallery.mobile,
							`video:${blockId}`,
							nextPage.mobile,
							`block:${blockId}`,
							automaticPagePhoneKeys(nextPage),
						);
						nextPage = { ...nextPage, mobile: movedChoice.destination, gallery: { ...nextPage.gallery, mobile: movedChoice.source } };
					}
				}
				return { ...prev, content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } } };
			}),
		addButtonBlock: (key) =>
			patchBlocks(key, (blocks) => [
				...blocks,
				{ id: uid('button'), type: 'button', label: 'View project', url: '', appearance: 'solid' },
			]),
		updateButtonBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'button' ? { ...block, ...patch } : block,
				),
			true, `page:${key}:button:${blockId}:${Object.keys(patch).sort().join(',')}`),
		addDividerBlock: (key) =>
			patchBlocks(key, (blocks) => [...blocks, { id: uid('divider'), type: 'divider' }]),
		addFormBlock: (key) =>
			patchBlocks(key, (blocks) => [
				...blocks,
				{
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
				},
			]),
		updateFormBlock: (key, blockId, patch) =>
			patchBlocks(key, (blocks) =>
				blocks.map((block) =>
					block.id === blockId && block.type === 'form' ? { ...block, ...patch, id: block.id, type: 'form' } : block,
				),
			true, `page:${key}:form:${blockId}:${Object.keys(patch).sort().join(',')}`),
		removeBlock: (key, blockId) =>
			commitDoc((prev) => {
				const page = prev.content.pages[key];
				if (!page) return prev;
				const target = (page.blocks ?? []).find((b) => b.id === blockId);
				const blocks = (page.blocks ?? []).filter((b) => b.id !== blockId);
				const phoneKey = target?.type === 'text' ? `text:${target.id}` : target?.type === 'embed' ? `video:${target.id}` : null;
					const nextPage = {
						...page,
						blocks,
						mobile: page.mobile
							? {
								...page.mobile,
								order: page.mobile.order.filter((item) => item !== `block:${blockId}`),
								items: Object.fromEntries(
									Object.entries(page.mobile.items ?? {}).filter(([item]) => item !== `block:${blockId}`),
								),
							}
							: undefined,
						gallery: phoneKey && page.gallery ? withoutPhoneItem(page.gallery, phoneKey) : page.gallery,
				};
				const next = {
					...prev,
					content: { ...prev.content, pages: { ...prev.content.pages, [key]: nextPage } },
				};
				// Removing an image group takes its folder (and images) off the site too.
				if (target?.type === 'images') {
					const stillUsed = referencedGalleryFolders(next.content.pages);
					if (!stillUsed.has(target.gallery.folder)) {
						const contentGalleries = { ...next.content.galleries };
						delete contentGalleries[target.gallery.folder];
						next.content = { ...next.content, galleries: contentGalleries };
						const docGalleries = { ...prev.galleries };
						delete docGalleries[target.gallery.folder];
						next.galleries = docGalleries;
					}
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
					meta: { title: '', alt: '', description: '', link: '' },
					assetId: registerAsset(file, file.name),
				})),
			]),
		replaceGalleryImage: (folder, id, file) => {
			const assetId = registerAsset(file, file.name);
			patchGallery(folder, (entries) =>
				entries.map((entry) => (entry.id === id ? { ...entry, filename: file.name, assetId } : entry)),
			);
		},
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

		setSiteDescription: (value) =>
			patchContent((c) => ({ ...c, site: { ...c.site, description: value } }), true, 'site:description'),
		setSiteLanguage: (value) =>
			patchContent((content) => ({
				...content,
				site: { ...content.site, language: value === 'en' ? undefined : value },
			})),
		setPageDescription: (key, value) =>
			patchPage(key, (page) => ({ ...page, description: value || undefined }), true, `page:${key}:description`),
		setOgImage: (sel) => commitDoc((prev) => ({ ...prev, ogImage: sel })),

		undo: () => {
			lastHistoryAction.current = null;
			const current = docRef.current;
			const previous = undoStack.current.pop();
			if (!previous || !current) return;
			redoStack.current.push(current);
			if (redoStack.current.length > HISTORY_LIMIT) redoStack.current.shift();
			replaceDoc(previous);
			syncHistoryState();
		},
		redo: () => {
			lastHistoryAction.current = null;
			const next = redoStack.current.pop();
			const current = docRef.current;
			if (!next || !current) return;
			undoStack.current.push(current);
			if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
			replaceDoc(next);
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
