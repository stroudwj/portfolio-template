// Geometry for the freeform image canvas. All units are percentages of the
// canvas WIDTH — including y — so a saved layout scales proportionally at any
// viewport size and the canvas's total height reduces to one aspect ratio.
import type { ImageLayout, TextFlowLayout, TextLayout } from '../lib/content';

export const DEFAULT_AR = 4 / 3;
/** Smallest width an image can be resized to, in canvas-width %. */
export const MIN_W = 4;
/** Gutter between auto-placed images, in canvas-width %. */
export const GUTTER = 2.5;
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
export const MIN_TEXT_W = 5;
/** Smallest useful normal-flow text box width, in content-width %. */
export const MIN_FLOW_TEXT_W = 20;

/** Aspect ratio of an embedded video player pinned to the canvas. */
export const EMBED_AR = 16 / 9;
/** Smallest width a canvas video can be resized to, in canvas-width %. */
export const MIN_EMBED_W = 8;

/** Fallback height for a canvas text whose real height hasn't been measured yet. */
const TEXT_H_GUESS = 6;

/** Bottom edge of a placed text, in canvas-width units. */
export const textBottom = (t: TextLayout): number => t.y + (t.h ?? TEXT_H_GUESS);

/** Same clamp for text placements (looser minimum width, no aspect ratio). */
export function clampTextLayout(t: TextLayout): TextLayout {
	const w = Math.min(Math.max(t.w, MIN_TEXT_W), 100);
	return { ...t, w, x: Math.min(Math.max(t.x, 0), 100 - w), y: Math.max(t.y, 0) };
}

/** Keep a normal-flow text box inside the page's padded content area. */
export function clampTextFlowLayout(layout: TextFlowLayout): TextFlowLayout {
	const w = Math.min(Math.max(layout.w, MIN_FLOW_TEXT_W), 100);
	return { w, x: Math.min(Math.max(layout.x, 0), 100 - w) };
}

/** Pointer location in canvas-width units. Re-reading the live rectangle makes
 * dragging stay attached to the cursor when the page scrolls beneath it. */
export function pointerInCanvas(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number },
): { x: number; y: number } {
	const scale = rect.width > 0 ? 100 / rect.width : 0;
	return {
		x: (clientX - rect.left) * scale,
		y: (clientY - rect.top) * scale,
	};
}

/** Snap a value to the nearest multiple of `step` (no-op for step <= 0). */
export const snapTo = (value: number, step: number): number =>
	step > 0 ? Math.round(value / step) * step : value;

/** How close (in canvas-width %) an edge must be before it magnetically snaps. */
export const EDGE_SNAP = 1.2;
/** Distance from the page midpoint at which a moving span centers itself. */
export const CENTER_SNAP = 1.2;

/** The nearest of `edges` within `threshold` of `value`, or null when none is. */
export function nearestEdge(value: number, edges: readonly number[], threshold: number): number | null {
	let best: number | null = null;
	for (const e of edges) {
		if (Math.abs(e - value) > threshold) continue;
		if (best === null || Math.abs(e - value) < Math.abs(best - value)) best = e;
	}
	return best;
}

/**
 * Magnetic alignment to neighboring items: given a moving span [pos, pos+size],
 * snap whichever of its two edges lands nearest one of `edges` (within
 * EDGE_SNAP), and return the adjusted pos. Used per-axis, so a dragged image's
 * top/bottom lines up with neighbors' tops/bottoms and its sides with their sides.
 */
export function snapSpanToEdges(pos: number, size: number, edges: readonly number[]): number {
	const lead = nearestEdge(pos, edges, EDGE_SNAP);
	const trail = nearestEdge(pos + size, edges, EDGE_SNAP);
	const dLead = lead === null ? Infinity : Math.abs(lead - pos);
	const dTrail = trail === null ? Infinity : Math.abs(trail - pos - size);
	if (dLead === Infinity && dTrail === Infinity) return pos;
	return dLead <= dTrail ? (lead as number) : (trail as number) - size;
}

/** Magnetically align the midpoint of a moving span to the page center. */
export function snapSpanToCenter(
	pos: number,
	size: number,
	center = 50,
	threshold = CENTER_SNAP,
): { value: number; snapped: boolean } {
	const delta = center - (pos + size / 2);
	return Math.abs(delta) <= threshold
		? { value: pos + delta, snapped: true }
		: { value: pos, snapped: false };
}

/** Snap a value to the nearest entry of `edges` (no-op when empty). */
export const snapToEdges = (value: number, edges: readonly number[]): number =>
	edges.reduce((best, e) => (Math.abs(e - value) < Math.abs(best - value) ? e : best), edges[0] ?? value);

/**
 * The n columns of the uniform Grid layout (full width, GUTTER between, no
 * outer margins), as {x, w} in canvas-width %. Column guides shade these bands
 * and adoptions from Grid mode place images into them, so both line up with
 * grid-mode image edges and margins.
 */
export function columnSpans(n: number): Array<{ x: number; w: number }> {
	const w = (100 - GUTTER * (n - 1)) / n;
	return Array.from({ length: n }, (_, col) => ({ x: col * (w + GUTTER), w }));
}

/** Every column edge (left and right of each band) — the x snap targets. */
export const columnEdges = (n: number): number[] => columnSpans(n).flatMap(({ x, w }) => [x, x + w]);

/**
 * Freeform layouts reproducing the uniform Grid arrangement: `ars` in display
 * order (pass the crop ratio for every item when the grid crops), `cols` per
 * row. Rows advance by the tallest item, like the CSS grid with items at the
 * top of their row.
 */
export function uniformGridLayouts(ars: number[], cols: number): ImageLayout[] {
	const spans = columnSpans(cols);
	const out: ImageLayout[] = [];
	let y = 0;
	let rowH = 0;
	ars.forEach((raw, i) => {
		const ar = raw || DEFAULT_AR;
		const { x, w } = spans[i % cols];
		out.push({ x, y, w, ar });
		rowH = Math.max(rowH, w / ar);
		if (i % cols === cols - 1) {
			y += rowH + GUTTER;
			rowH = 0;
		}
	});
	return out;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Two decimals is plenty of precision and keeps content.json readable. */
export const roundLayout = (l: ImageLayout): ImageLayout => ({
	x: round2(l.x),
	y: round2(l.y),
	w: round2(l.w),
	ar: round2(l.ar),
	...(l.z !== undefined ? { z: round2(l.z) } : {}),
	...(l.locked ? { locked: true } : {}),
});

export const roundTextLayout = (t: TextLayout): TextLayout => ({
	x: round2(t.x),
	y: round2(t.y),
	w: round2(t.w),
	...(t.h !== undefined ? { h: round2(t.h) } : {}),
	...(t.z !== undefined ? { z: round2(t.z) } : {}),
});

export const roundTextFlowLayout = (layout: TextFlowLayout): TextFlowLayout => {
	const clamped = clampTextFlowLayout(layout);
	return { x: round2(clamped.x), w: round2(clamped.w) };
};

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
export function flowMissing(items: FlowItem[], minimumY = 0): Map<number, ImageLayout> {
	const placed = items.flatMap((i) => (i.layout ? [i.layout] : []));
	let y = Math.max(placed.length ? canvasHeight(placed) + GUTTER : 0, minimumY);
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
