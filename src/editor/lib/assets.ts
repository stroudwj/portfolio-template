// In-memory registry of uploaded images. The editor document only stores string
// `assetId`s; the actual Blob + object URL live here (module-level, stable across
// renders). Blobs are also mirrored to IndexedDB so autosave survives a refresh.
import { persistAssetBlob } from './persistence';

interface AssetRecord {
	blob: Blob;
	url: string;
	filename: string;
}

const registry = new Map<string, AssetRecord>();
let counter = 0;

/** Short, collision-resistant id. */
export function uid(prefix = 'a'): string {
	counter += 1;
	return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Register a freshly uploaded blob; returns its assetId (also persists it). */
export function registerAsset(blob: Blob, filename: string): string {
	const id = uid('img');
	registry.set(id, { blob, url: URL.createObjectURL(blob), filename });
	void persistAssetBlob(id, blob, filename);
	return id;
}

/** Re-register a blob restored from IndexedDB (no re-persist, keep the same id). */
export function restoreAsset(id: string, blob: Blob, filename: string): void {
	if (registry.has(id)) return;
	registry.set(id, { blob, url: URL.createObjectURL(blob), filename });
}

export function getAssetUrl(id?: string | null): string | undefined {
	return id ? registry.get(id)?.url : undefined;
}

export function getAssetBlob(id?: string | null): Blob | undefined {
	return id ? registry.get(id)?.blob : undefined;
}
