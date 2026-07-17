// Geometry for the freeform image canvas. All units are percentages of the
// canvas WIDTH — including y — so a saved layout scales proportionally at any
// viewport size and the canvas's total height reduces to one aspect ratio.
import type { ImageLayout } from '../lib/content';

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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Two decimals is plenty of precision and keeps content.json readable. */
export const roundLayout = (l: ImageLayout): ImageLayout => ({
	x: round2(l.x),
	y: round2(l.y),
	w: round2(l.w),
	ar: round2(l.ar),
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
