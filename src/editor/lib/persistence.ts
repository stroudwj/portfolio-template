// Autosave: the document's text/config goes to localStorage; uploaded image
// blobs go to IndexedDB (too big for localStorage). Together they let a refresh
// restore everything the user was working on.
import { get, set, del, keys } from 'idb-keyval';
import type { EditorDoc } from './types';
import { hasKey } from './storage';

const DOC_KEY = 'portfolio-editor:doc';
const DOC_BACKUP_KEY = 'portfolio-editor:doc-backup';
const CORRUPT_DOC_BACKUP_KEY = 'portfolio-editor:corrupt-doc-backup';
const CORRUPT_VERSIONS_BACKUP_KEY = 'portfolio-editor:corrupt-saved-versions-backup';
const SAVED_VERSIONS_KEY = 'portfolio-editor:saved-versions';
const ASSET_PREFIX = 'portfolio-editor:asset:';
const SAVED_VERSION_LIMIT = 8;
const pendingAssetWrites = new Set<Promise<void>>();

export interface SavedVersion {
	id: string;
	name: string;
	savedAt: string;
	doc: EditorDoc;
}

export function saveDoc(doc: EditorDoc): void {
	try {
		// Autosave needs to know when this fails so the editor never tells an artist
		// their work is safe when browser storage is unavailable or full.
		localStorage.setItem(DOC_KEY, JSON.stringify(doc));
	} catch {
		throw new Error('Your browser could not save this draft. Its storage may be full or blocked.');
	}
}

export function loadDoc(): unknown | null {
	let raw: string | null;
	try {
		raw = localStorage.getItem(DOC_KEY);
	} catch {
		throw new Error('This browser blocked access to your saved draft. Nothing was replaced.');
	}
	if (raw === null) return null;
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		// Preserve the exact unreadable text separately before surfacing the error.
		// Most importantly, never return null: resumeDraft would treat that as a
		// missing draft and could overwrite the only recovery copy.
		try {
			localStorage.setItem(CORRUPT_DOC_BACKUP_KEY, raw);
		} catch {
			/* the original value at DOC_KEY is still untouched */
		}
		throw new Error('Your saved draft is damaged and could not be opened. The original data was kept and was not replaced.');
	}
}

/** Keep the untouched pre-migration JSON until the user deliberately resets. */
export function backupDocBeforeMigration(doc: unknown): void {
	try {
		localStorage.setItem(DOC_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), doc }));
	} catch {
		throw new Error('This browser could not make a safety copy before upgrading your draft. Nothing was replaced.');
	}
}

export function hasSavedDoc(): boolean {
	return hasKey(DOC_KEY);
}

/** Named, browser-local restore points. Image pixels stay in the shared asset
 * store, so versions remain lightweight and do not duplicate large uploads. */
export function loadSavedVersions(): SavedVersion[] {
	let raw: string | null;
	try {
		raw = localStorage.getItem(SAVED_VERSIONS_KEY);
	} catch {
		throw new Error('This browser blocked access to your saved versions.');
	}
	if (raw === null) return [];
	let value: unknown;
	try {
		value = JSON.parse(raw) as unknown;
	} catch {
		try {
			localStorage.setItem(CORRUPT_VERSIONS_BACKUP_KEY, raw);
		} catch {
			/* the original saved-version value remains untouched */
		}
		throw new Error('Your saved versions are damaged. They were kept and will not be overwritten.');
	}
	const valid = (item: unknown): item is SavedVersion =>
		typeof item === 'object' &&
		item !== null &&
		typeof (item as SavedVersion).id === 'string' &&
		typeof (item as SavedVersion).name === 'string' &&
		typeof (item as SavedVersion).savedAt === 'string' &&
		typeof (item as SavedVersion).doc === 'object' &&
		(item as SavedVersion).doc !== null;
	if (!Array.isArray(value) || !value.every(valid))
		throw new Error('Your saved versions are incomplete. They were kept and will not be overwritten.');
	return value;
}

function versionAssetIds(doc: EditorDoc): Set<string> {
	const ids = new Set<string>();
	for (const entries of Object.values(doc.galleries))
		for (const entry of entries) if (entry.assetId) ids.add(entry.assetId);
	for (const slot of [
		doc.profileImage,
		doc.logoImage,
		doc.resumeFile,
		...Object.values(doc.pageThumbs),
		...Object.values(doc.productImages),
		...Object.values(doc.fonts),
	])
		if (slot?.assetId) ids.add(slot.assetId);
	return ids;
}

async function assertVersionAssetsAvailable(doc: EditorDoc): Promise<void> {
	// If the artist clicks Save version immediately after an upload, let that
	// browser write finish instead of asking them to guess when it is ready.
	await Promise.allSettled([...pendingAssetWrites]);
	for (const id of versionAssetIds(doc)) {
		let stored: unknown;
		try {
			stored = await get(ASSET_PREFIX + id);
		} catch {
			throw new Error('This browser could not check the uploaded files, so the version was not saved.');
		}
		if (
			typeof stored !== 'object' ||
			stored === null ||
			!('blob' in stored) ||
			!((stored as { blob?: unknown }).blob instanceof Blob)
		)
			throw new Error(
				'An uploaded file is not safely stored in this browser yet. Wait a moment and save this version again.',
			);
	}
}

export async function saveNamedVersion(doc: EditorDoc, name: string): Promise<SavedVersion> {
	// A restore point that references missing pixels is not a real recovery point.
	// Check durable IndexedDB storage before telling the artist the version is safe.
	await assertVersionAssetsAvailable(doc);
	const version: SavedVersion = {
		id: `version-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
		name: name.trim() || 'Saved version',
		savedAt: new Date().toISOString(),
		doc: JSON.parse(JSON.stringify(doc)) as EditorDoc,
	};
	const existing = loadSavedVersions();
	try {
		localStorage.setItem(
			SAVED_VERSIONS_KEY,
			JSON.stringify([version, ...existing].slice(0, SAVED_VERSION_LIMIT)),
		);
		return version;
	} catch {
		throw new Error('This version could not be saved. Your browser storage may be full or blocked.');
	}
}

export function deleteSavedVersion(id: string): void {
	try {
		localStorage.setItem(SAVED_VERSIONS_KEY, JSON.stringify(loadSavedVersions().filter((version) => version.id !== id)));
	} catch {
		throw new Error('This saved version could not be removed.');
	}
}

export function persistAssetBlob(id: string, blob: Blob, filename: string): Promise<void> {
	// Start inside a promise so environments that lack IndexedDB report an
	// ordinary rejected write instead of throwing before registerAsset returns.
	const write = Promise.resolve().then(() => set(ASSET_PREFIX + id, { blob, filename })).catch(() => {
		throw new Error(`The file “${filename}” could not be saved in this browser.`);
	});
	pendingAssetWrites.add(write);
	void write.then(
		() => pendingAssetWrites.delete(write),
		() => pendingAssetWrites.delete(write),
	);
	return write;
}

/** Remove a specifically identified persisted blob. Used only to roll back a
 * failed staged backup import whose fresh ids are not referenced by any document. */
export async function deletePersistedAssetBlob(id: string): Promise<void> {
	await del(ASSET_PREFIX + id);
}

export interface StoredAsset {
	id: string;
	blob: Blob;
	filename: string;
}

export async function loadAllAssetBlobs(): Promise<StoredAsset[]> {
	try {
		const allKeys = (await keys()) as string[];
		const assetKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(ASSET_PREFIX));
		const results: StoredAsset[] = [];
		for (const key of assetKeys) {
			const value = (await get(key)) as { blob: Blob; filename: string } | undefined;
			if (value) results.push({ id: key.slice(ASSET_PREFIX.length), blob: value.blob, filename: value.filename });
		}
		return results;
	} catch {
		throw new Error('This browser could not read the uploaded files saved with your draft. Nothing was replaced.');
	}
}

export async function clearPersisted(): Promise<void> {
	try {
		localStorage.removeItem(DOC_KEY);
		localStorage.removeItem(DOC_BACKUP_KEY);
		localStorage.removeItem(CORRUPT_DOC_BACKUP_KEY);
		localStorage.removeItem(CORRUPT_VERSIONS_BACKUP_KEY);
		localStorage.removeItem(SAVED_VERSIONS_KEY);
		const allKeys = (await keys()) as string[];
		await Promise.all(
			allKeys.filter((k) => typeof k === 'string' && k.startsWith(ASSET_PREFIX)).map((k) => del(k)),
		);
	} catch {
		throw new Error('This browser could not clear the saved draft. Your work was kept.');
	}
}
