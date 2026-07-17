// Geometry for the freeform image canvas. All units are percentages of the
// canvas WIDTH — including y — so a saved layout scales proportionally at any
// viewport size and the canvas's total height reduces to one aspect ratio.
import type { ImageLayout, TextLayout } from '../lib/content';

export const DEFAULT_AR = 4 / 3;
/** Smallest width an image can be resized to, in canvas-width %. */
export const MIN_W = 8;
/** Gutter between auto-placed images, in canvas-width %. */
const GUTTER = 2.5;
/** Auto-placed images per row. */
const COLS = 3;

/** Bottom edge of a placed image, in canvas-width units. */
export const bottomOf = (l: ImageLayout): number => l.y + l.w / l.ar;

/** Canvas height (in width-%) needed to contain every layout. */
export const canvasHeight = (layouts: ImageLayout[]): number =>
	layouts.reduce((max, l) => Math.max(max, bottomOf(l)), 0);

/** Keep a layout on the canvas: sane width, x fully inside, y not above the top. */
export function clampLayout(l: ImageLayout): ImageLayout {
	const w = Math.min(Math.max(l.w, MIN_W), 100);
	return { ...l, w, x: Math.min(Math.max(l.x, 0), 100 - w), y: Math.max(l.y, 0) };
}

/** Smallest width a canvas text can be resized to, in canvas-width %. */
export const MIN_TEXT_W = 10;

/** Aspect ratio of an embedded video player pinned to the canvas. */
export const EMBED_AR = 16 / 9;
/** Smallest width a canvas video can be resized to, in canvas-width %. */
export const MIN_EMBED_W = 15;

/** Fallback height for a canvas text whose real height hasn't been measured yet. */
const TEXT_H_GUESS = 6;

/** Bottom edge of a placed text, in canvas-width units. */
export const textBottom = (t: TextLayout): number => t.y + (t.h ?? TEXT_H_GUESS);

/** Same clamp for text placements (looser minimum width, no aspect ratio). */
export function clampTextLayout(t: TextLayout): TextLayout {
	const w = Math.min(Math.max(t.w, MIN_TEXT_W), 100);
	return { ...t, w, x: Math.min(Math.max(t.x, 0), 100 - w), y: Math.max(t.y, 0) };
}

/** Snap a value to the nearest multiple of `step` (no-op for step <= 0). */
export const snapTo = (value: number, step: number): number =>
	step > 0 ? Math.round(value / step) * step : value;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Two decimals is plenty of precision and keeps content.json readable. */
export const roundLayout = (l: ImageLayout): ImageLayout => ({
	x: round2(l.x),
	y: round2(l.y),
	w: round2(l.w),
	ar: round2(l.ar),
});

export const roundTextLayout = (t: TextLayout): TextLayout => ({
	x: round2(t.x),
	y: round2(t.y),
	w: round2(t.w),
	...(t.h !== undefined ? { h: round2(t.h) } : {}),
});

export interface FlowItem {
	layout?: ImageLayout;
	/** Natural width/height ratio when known. */
	ar?: number;
}

/**
 * Default positions (keyed by item index) for items without a stored layout:
 * rows of three flowing below everything already placed. Deterministic, so the
 * server render, the hydrated client, and the editor preview all agree.
 */
export function flowMissing(items: FlowItem[]): Map<number, ImageLayout> {
	const placed = items.flatMap((i) => (i.layout ? [i.layout] : []));
	let y = placed.length ? canvasHeight(placed) + GUTTER : 0;
	const w = (100 - GUTTER * (COLS + 1)) / COLS;
	const out = new Map<number, ImageLayout>();
	let col = 0;
	let rowH = 0;
	items.forEach((item, index) => {
		if (item.layout) return;
		const ar = item.ar || DEFAULT_AR;
		out.set(index, { x: GUTTER + col * (w + GUTTER), y, w, ar });
		rowH = Math.max(rowH, w / ar);
		col += 1;
		if (col === COLS) {
			col = 0;
			y += rowH + GUTTER;
			rowH = 0;
		}
	});
	return out;
}
