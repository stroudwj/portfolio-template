import type { ImageEntry } from './types';
import {
	aspectDifference,
	getSampleArtwork,
	sampleReplacement,
} from './sample-artwork';

/**
 * Build the result of an artist explicitly accepting a catalog successor.
 * Merely loading a draft never calls this function, so replacement cannot be
 * silent. The stable editor id and placement survive the swap.
 */
export function entryWithSampleSuccessor(entry: ImageEntry): ImageEntry {
	if (!entry.sampleAssetId) return entry;
	const current = getSampleArtwork(entry.sampleAssetId);
	const successor = sampleReplacement(entry.sampleAssetId);
	if (!current || !successor || aspectDifference(current, successor) > 0.03)
		return entry;
	const filename = successor.url.split('/').pop() || entry.filename;
	return {
		...entry,
		filename,
		assetId: null,
		sampleAssetId: successor.id,
		meta: {
			...entry.meta,
			title: successor.title,
			alt: successor.alt,
			decorative: undefined,
			description: successor.credit,
			link: successor.objectUrl,
			layout: entry.meta.layout
				? { ...entry.meta.layout, ar: successor.aspectRatio }
				: undefined,
		},
	};
}
