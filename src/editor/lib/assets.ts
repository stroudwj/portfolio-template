// In-memory registry of uploaded images. The editor document only stores string
// `assetId`s; the actual Blob + object URL live here (module-level, stable across
// renders). Blobs are also mirrored to IndexedDB so autosave survives a refresh.
import { persistAssetBlob } from './persistence';

interface AssetRecord {
	blob: Blob;
	url: string;
	filename: string;
	/** Downscaled copy the editor renders; the untouched original is what publishes. */
	previewUrl?: string;
}

const registry = new Map<string, AssetRecord>();
let counter = 0;

// ---- change notification ----
// Previews are generated async after registration; subscribers re-render when one
// lands so getAssetPreviewUrl() starts returning the light copy.
let version = 0;
const listeners = new Set<() => void>();

export function subscribeAssets(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getAssetsVersion(): number {
	return version;
}

function notifyAssets(): void {
	version += 1;
	for (const listener of listeners) listener();
}

/** Longest side of the editor's working copies. Rendering multi-megapixel originals
 *  makes every drag and scroll re-composite them at full size; ~1600px is sharp at
 *  editor sizes while staying cheap to decode. */
const PREVIEW_MAX_PX = 1600;
/** Originals under this size are cheap enough to render directly. */
const PREVIEW_MIN_BYTES = 300 * 1024;

async function makePreview(record: AssetRecord): Promise<void> {
	// Skip vectors (scale losslessly) and gifs (downscaling would drop the animation).
	if (!/^image\/(jpeg|png|webp|avif)$/i.test(record.blob.type)) return;
	if (record.blob.size < PREVIEW_MIN_BYTES) return;
	try {
		const bitmap = await createImageBitmap(record.blob);
		const scale = PREVIEW_MAX_PX / Math.max(bitmap.width, bitmap.height);
		if (scale >= 1) {
			bitmap.close();
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		// webp keeps alpha; browsers that can't encode it fall back to png.
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
		if (!blob) return;
		record.previewUrl = URL.createObjectURL(blob);
		notifyAssets();
	} catch {
		/* best-effort — the original still renders */
	}
}

/** Short, collision-resistant id. */
export function uid(prefix = 'a'): string {
	counter += 1;
	return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Register a freshly uploaded blob; returns its assetId (also persists it). */
export function registerAsset(blob: Blob, filename: string): string {
	const id = uid('img');
	const record: AssetRecord = { blob, url: URL.createObjectURL(blob), filename };
	registry.set(id, record);
	void persistAssetBlob(id, blob, filename);
	void makePreview(record);
	return id;
}

/** Re-register a blob restored from IndexedDB (no re-persist, keep the same id). */
export function restoreAsset(id: string, blob: Blob, filename: string): void {
	if (registry.has(id)) return;
	const record: AssetRecord = { blob, url: URL.createObjectURL(blob), filename };
	registry.set(id, record);
	void makePreview(record);
}

/** Original object URL — full resolution (export, lightbox, downloads). */
export function getAssetUrl(id?: string | null): string | undefined {
	return id ? registry.get(id)?.url : undefined;
}

/** Downscaled working copy for editor rendering (falls back to the original). */
export function getAssetPreviewUrl(id?: string | null): string | undefined {
	const record = id ? registry.get(id) : undefined;
	return record ? (record.previewUrl ?? record.url) : undefined;
}

export function getAssetBlob(id?: string | null): Blob | undefined {
	return id ? registry.get(id)?.blob : undefined;
}
