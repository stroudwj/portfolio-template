// Autosave: the document's text/config goes to localStorage; uploaded image
// blobs go to IndexedDB (too big for localStorage). Together they let a refresh
// restore everything the user was working on.
import { get, set, del, keys } from 'idb-keyval';
import type { EditorDoc } from './types';
import { readJson, writeJson, hasKey } from './storage';

const DOC_KEY = 'portfolio-editor:doc';
const ASSET_PREFIX = 'portfolio-editor:asset:';

export function saveDoc(doc: EditorDoc): void {
	writeJson(DOC_KEY, doc);
}

export function loadDoc(): EditorDoc | null {
	return readJson<EditorDoc>(DOC_KEY);
}

export function hasSavedDoc(): boolean {
	return hasKey(DOC_KEY);
}

export async function persistAssetBlob(id: string, blob: Blob, filename: string): Promise<void> {
	try {
		await set(ASSET_PREFIX + id, { blob, filename });
	} catch {
		/* non-fatal */
	}
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
		return [];
	}
}

export async function clearPersisted(): Promise<void> {
	try {
		localStorage.removeItem(DOC_KEY);
		const allKeys = (await keys()) as string[];
		await Promise.all(
			allKeys.filter((k) => typeof k === 'string' && k.startsWith(ASSET_PREFIX)).map((k) => del(k)),
		);
	} catch {
		/* non-fatal */
	}
}
