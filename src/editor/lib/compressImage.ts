// Downscale + re-encode images in the browser. Camera photos (5–25 MB) break
// publishing — GitHub's create-blob API rejects request bodies past roughly 25 MB
// (base64 inflates files by a third) with an opaque "input was too large" error —
// and would make published galleries painfully slow anyway. Compression happens at
// the moment a file enters the editor (ImageDrop), so previews, drafts, and publish
// all hold the same, already-small asset; publish keeps a rescue pass for drafts
// saved before this existed.

/** Longest edge after downscale — crisp on a 4K display, ~10× smaller than camera output. */
const MAX_EDGE = 3200;
const QUALITY = 0.82;
/** Already small and within MAX_EDGE: pass through untouched. */
const SKIP_BYTES = 1.5 * 1024 * 1024;

// Only formats a canvas can re-encode without losing something. GIFs would lose
// animation, SVGs are vectors; both (and anything unknown) pass through.
const RECOMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** MIME type from a file name, for bytes that lost their File (publish rescue). */
export function imageTypeFromName(name: string): string | null {
	const ext = name.toLowerCase().split('.').pop();
	if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	return null;
}

/**
 * Returns a smaller re-encoded copy of `file` (possibly with a new extension), or
 * the original when compression isn't possible or wouldn't help. Never throws.
 *
 * `keepType` re-encodes in the file's own format and never renames — for the
 * publish rescue path, where content.json already references the file name.
 */
export async function compressImage(file: File, { keepType = false } = {}): Promise<File> {
	if (!RECOMPRESSIBLE.has(file.type)) return file;

	const source = await decode(file);
	if (!source) return file; // undecodable — the size caps still apply downstream

	try {
		const w = source.width;
		const h = source.height;
		const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
		if (scale === 1 && file.size <= SKIP_BYTES) return file;

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(w * scale));
		canvas.height = Math.max(1, Math.round(h * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

		let blob: Blob | null;
		let name: string;
		if (keepType) {
			blob = await toBlob(canvas, file.type, QUALITY);
			name = file.name;
			// The browser can't encode this format (e.g. webp on older Safari) and fell
			// back to another one — a re-typed file would lie about its extension.
			if (blob && blob.type !== file.type) blob = null;
		} else {
			// JPEG can't carry alpha; keep transparency in webp (png where webp encoding
			// is unavailable — toBlob falls back to png on those browsers).
			const alpha = file.type !== 'image/jpeg' && hasAlpha(source);
			let ext: string;
			if (!alpha) {
				blob = await toBlob(canvas, 'image/jpeg', QUALITY);
				ext = 'jpg';
			} else {
				blob = await toBlob(canvas, 'image/webp', QUALITY);
				ext = blob?.type === 'image/webp' ? 'webp' : 'png';
			}
			name = renameExt(file.name, ext);
		}
		if (!blob || blob.size >= file.size) return file;
		return new File([blob], name, { type: blob.type });
	} finally {
		if ('close' in source) source.close();
	}
}

type Decoded = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<Decoded | null> {
	// createImageBitmap decodes off the main thread and applies EXIF orientation.
	try {
		return await createImageBitmap(file);
	} catch {
		/* fall through to <img> */
	}
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} catch {
		return null;
	} finally {
		// Safe once decode() resolved: the bitmap is in memory, not read from the URL.
		URL.revokeObjectURL(url);
	}
}

/** Sample the image on a small canvas — full-size getImageData on a photo is ~30 MB. */
function hasAlpha(source: Decoded): boolean {
	const probe = document.createElement('canvas');
	probe.width = probe.height = 64;
	const ctx = probe.getContext('2d', { willReadFrequently: true });
	if (!ctx) return true; // can't tell — assume alpha, the lossless-ish path
	ctx.drawImage(source, 0, 0, 64, 64);
	const data = ctx.getImageData(0, 0, 64, 64).data;
	for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
	return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renameExt(name: string, ext: string): string {
	return `${name.replace(/\.[^.]+$/, '')}.${ext}`;
}
