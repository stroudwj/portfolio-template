import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Content, SocialLink } from '../lib/content';
import type { EditorDoc, ImageEntry, ImageMeta } from './lib/types';
import { blankDoc, existingDoc, initDocFromContent } from './lib/content-init';
import { registerAsset, restoreAsset } from './lib/assets';
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

export interface EditorContextValue {
	doc: EditorDoc | null;
	hasDraft: boolean;
	// lifecycle
	startBlank(): void;
	startExisting(): void;
	resumeDraft(): Promise<void>;
	importContent(content: Content): void;
	/** Open a fully-formed document (e.g. one loaded from GitHub, assets already registered). */
	openDoc(doc: EditorDoc): void;
	reset(): Promise<void>;
	// profile / contact
	setName(value: string): void;
	setBio(value: string): void;
	setEmail(value: string): void;
	setProfileImage(file: File): void;
	removeProfileImage(): void;
	// social
	addSocial(): void;
	updateSocial(index: number, patch: Partial<SocialLink>): void;
	removeSocial(index: number): void;
	moveSocial(from: number, to: number): void;
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

	const value = useMemo<EditorContextValue>(() => ({
		doc,
		hasDraft,

		startBlank: () => setDoc(blankDoc()),
		startExisting: () => setDoc(existingDoc()),
		resumeDraft: async () => {
			const stored = await loadAllAssetBlobs();
			for (const a of stored) restoreAsset(a.id, a.blob, a.filename);
			const saved = loadSavedDoc();
			if (saved) setDoc(saved);
			else setDoc(existingDoc());
		},
		importContent: (content: Content) => setDoc(initDocFromContent(content)),
		openDoc: (next: EditorDoc) => {
			setHasDraft(true);
			setDoc(next);
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

		addSocial: () => patchContent((c) => ({ ...c, social: [...c.social, { label: '', url: '' }] })),
		updateSocial: (index, patch) =>
			patchContent((c) => ({ ...c, social: c.social.map((s, i) => (i === index ? { ...s, ...patch } : s)) })),
		removeSocial: (index) => patchContent((c) => ({ ...c, social: c.social.filter((_, i) => i !== index) })),
		moveSocial: (from, to) => patchContent((c) => ({ ...c, social: arrayMove(c.social, from, to) })),

		addGalleryImages: (folder, files) =>
			patchGallery(folder, (entries) => [
				...entries,
				...files.map((file) => ({
					id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
					filename: file.name,
					meta: { title: '', description: '', link: '' },
					assetId: registerAsset(file, file.name),
				})),
			]),
		removeGalleryImage: (folder, id) => patchGallery(folder, (entries) => entries.filter((e) => e.id !== id)),
		moveGalleryImage: (folder, from, to) => patchGallery(folder, (entries) => arrayMove(entries, from, to)),
		updateGalleryMeta: (folder, id, patch) =>
			patchGallery(folder, (entries) => entries.map((e) => (e.id === id ? { ...e, meta: { ...e.meta, ...patch } } : e))),
	}), [doc, hasDraft, patchContent, patchGallery]);

	return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
