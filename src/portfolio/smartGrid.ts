// Smart grid: aspect-aware justified rows for Grid mode. Pure functions only —
// the same inputs must produce the same mosaic in the editor preview, the
// browser publish (staticgen), and the Astro template build, so publish always
// matches preview. Widths inside a row come from flexbox (flex-grow = aspect
// ratio over a 0 basis makes every item in a row the same height); this module
// only decides which images share a row and what the gallery-wall variance is.
import type { ImageLayout } from '../lib/content';
import { DEFAULT_AR, GUTTER } from './canvasLayout';

/** The historic uniform-grid gap in rem — the default for both gap controls. */
export const DEFAULT_GRID_GAP = 1.25;

/** Clamp a stored gap to something renderable; absent keeps the historic gap. */
export const gridGap = (value: number | undefined): number =>
	value === undefined || Number.isNaN(value) ? DEFAULT_GRID_GAP : Math.min(Math.max(value, 0), 8);

/** A row's target aspect-ratio sum. Scaling the mean by the column count keeps
 * "Columns" meaning "about this many per row": squares pack exactly `cols`
 * wide, landscapes fewer, portraits more. */
export function rowTargetSum(ars: readonly number[], cols: number): number {
	if (ars.length === 0) return cols;
	const mean = ars.reduce((sum, ar) => sum + (ar || DEFAULT_AR), 0) / ars.length;
	return cols * mean;
}

/**
 * Greedily group image indices into justified rows: keep adding to the open
 * row while doing so brings its aspect-ratio sum closer to the target.
 * Order-preserving and deterministic.
 */
export function packSmartRows(ars: readonly number[], cols: number): number[][] {
	const target = rowTargetSum(ars, cols);
	const rows: number[][] = [];
	let row: number[] = [];
	let sum = 0;
	ars.forEach((raw, index) => {
		const ar = raw || DEFAULT_AR;
		if (row.length > 0 && Math.abs(sum + ar - target) > Math.abs(sum - target)) {
			rows.push(row);
			row = [];
			sum = 0;
		}
		row.push(index);
		sum += ar;
	});
	if (row.length > 0) rows.push(row);
	return rows;
}

/** Leftover flex weight that stops a sparse final row from stretching its few
 * images to fill the full width (rendered as an invisible spacer item). */
export function lastRowSpacer(rowArs: readonly number[], target: number): number {
	const sum = rowArs.reduce((total, ar) => total + (ar || DEFAULT_AR), 0);
	const leftover = target - sum;
	// Within ~half an average image of full, let the row justify like the rest.
	return leftover > target / 10 ? leftover : 0;
}

/**
 * Freeform layouts reproducing the smart-grid mosaic, for "Edit this
 * arrangement in Freeform" (GUTTER-spaced like the uniform adoption; the
 * gallery-wall jitter is deliberately not baked — adoption hands over the
 * clean mosaic). Within a row every height equals the row's scale factor, so
 * x advances by width + GUTTER and y by scale + GUTTER.
 */
export function smartGridLayouts(ars: readonly number[], cols: number): ImageLayout[] {
	const rows = packSmartRows(ars, cols);
	const target = rowTargetSum(ars, cols);
	const out: ImageLayout[] = new Array(ars.length);
	let y = 0;
	rows.forEach((row, rowIndex) => {
		const rowArs = row.map((index) => ars[index] || DEFAULT_AR);
		const sum = rowArs.reduce((total, ar) => total + ar, 0);
		const isLast = rowIndex === rows.length - 1 && rows.length > 1;
		const effectiveSum = sum + (isLast ? lastRowSpacer(rowArs, target) : 0);
		const scale = (100 - GUTTER * (row.length - 1)) / effectiveSum;
		let x = 0;
		row.forEach((index, position) => {
			const ar = rowArs[position];
			out[index] = { x, y, w: ar * scale, ar };
			x += ar * scale + GUTTER;
		});
		y += scale + GUTTER;
	});
	return out;
}

/** Deterministic hash of a string seed to [0, 1) (FNV-1a, then scrambled). */
export function seededUnit(seed: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	// One xorshift-multiply round so near-identical seeds diverge.
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	h ^= h >>> 12;
	return (h >>> 0) / 0x100000000;
}

export interface WallJitter {
	/** Fraction of the cell the artwork occupies (1 = full cell). */
	scale: number;
	/** Where the shrunken artwork sits inside its cell. */
	alignX: 'start' | 'center' | 'end';
	alignY: 'start' | 'center' | 'end';
}

const ALIGNMENTS = ['start', 'center', 'end'] as const;

/** Gallery-wall variance for one artwork, derived from its stable id — the
 * jitter never depends on list position, so adding or removing a piece leaves
 * every other frame exactly where it hung. */
export function wallJitter(seed: string): WallJitter {
	return {
		scale: 0.72 + 0.28 * seededUnit(`${seed}:scale`),
		alignX: ALIGNMENTS[Math.floor(seededUnit(`${seed}:x`) * 3) % 3],
		alignY: ALIGNMENTS[Math.floor(seededUnit(`${seed}:y`) * 3) % 3],
	};
}
