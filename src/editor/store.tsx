import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Content, SocialLink, Theme, PageBlock, PageConfig } from '../lib/content';
import type { EditorDoc, ImageEntry, ImageMeta } from './lib/types';
import { blankDoc, existingDoc, upgradeDoc } from './lib/content-init';
import { registerAsset, restoreAsset, uid } from './lib/assets';
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

export interface EditorContextValue {
	doc: EditorDoc | null;
	hasDraft: boolean;
	// lifecycle
	startBlank(): void;
	startExisting(): void;
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
	// theme
	setTheme(patch: Partial<Theme>): void;
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
	renamePage(key: string, label: string): void;
	setPageHeading(key: string, heading: string): void;
	setPageThumb(key: string, file: File): void;
	removePageThumb(key: string): void;
	// page blocks
	addTextBlock(key: string): void;
	updateTextBlock(key: string, blockId: string, text: string): void;
	removeBlock(key: string, blockId: string): void;
	moveBlock(key: string, from: number, to: number): void;
	// galleries
	addGalleryImages(folder: string, files: File[]): void;
	removeGalleryImage(folder: string, id: string): void;
	moveGalleryImage(folder: string, from: number, to: number): void;
	updateGalleryMeta(folder: string, id: string, patch: Partial<ImageMeta>): void;
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

	const value = useMemo<EditorContextValue>(() => ({
		doc,
		hasDraft,

		startBlank: () => setDoc(blankDoc()),
		startExisting: () => setDoc(existingDoc()),
		resumeDraft: async () => {
			const stored = await loadAllAssetBlobs();
			for (const a of stored) restoreAsset(a.id, a.blob, a.filename);
			const saved = loadSavedDoc();
			if (saved) setDoc(upgradeDoc(saved));
			else setDoc(existingDoc());
		},
		openDoc: (next: EditorDoc) => {
			setHasDraft(true);
			setDoc(upgradeDoc(next));
		},
		reset: async () => {
			await clearPersisted();
			setHasDraft(false);
			setDoc(null);
		},

		setName: (value) => patchContent((c) => ({ ...c, site: { ...c.site, name: value } })),
		setBio: (value) => patchContent((c) => ({ ...c, profile: { ...c.profile, bio: value } })),
		setEmail: (value) => patchContent((c) => ({ ...c, contact: { ...c.contact, email: value } })),

		setProfileImage: (file) => {
			const assetId = registerAsset(file, file.name);
			setDoc((prev) => (prev ? { ...prev, profileImage: { filename: file.name, assetId } } : prev));
		},
		removeProfileImage: () => setDoc((prev) => (prev ? { ...prev, profileImage: { filename: '', assetId: null } } : prev)),

		setTheme: (patch) => patchContent((c) => ({ ...c, theme: { ...c.theme, ...patch } })),

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
				const doomedFolders = doomed
					.map((k) => prev.content.pages[k]?.gallery?.folder)
					.filter((f): f is string => !!f);

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

		renamePage: (key, label) =>
			patchContent((c) => ({
				...c,
				nav: c.nav.map((item) => (item.path === key ? { ...item, label } : item)),
				pages: c.pages[key] ? { ...c.pages, [key]: { ...c.pages[key], label } } : c.pages,
			})),

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
		removeBlock: (key, blockId) => patchBlocks(key, (blocks) => blocks.filter((b) => b.id !== blockId)),
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
		updateGalleryMeta: (folder, id, patch) =>
			patchGallery(folder, (entries) => entries.map((e) => (e.id === id ? { ...e, meta: { ...e.meta, ...patch } } : e))),
	}), [doc, hasDraft, patchContent, patchGallery, patchPage, patchBlocks]);

	return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
