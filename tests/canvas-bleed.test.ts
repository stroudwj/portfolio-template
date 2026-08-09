// Spec 21 — freeform canvas edge bleed. clampLayout/clampTextLayout let an
// item hang up to half its width past the canvas's left/right edges (never
// fully escaping: the inner half stays grabbable), nudges and group moves
// share the same allowance, and the per-section full-bleed flag survives the
// content schema and reaches the published HTML.
import { describe, expect, it } from 'vitest';
import {
	canvasDxBounds,
	clampLayout,
	clampTextLayout,
	maxWEastOf,
	maxWWestOf,
	maxXFor,
	MIN_W,
	minXFor,
	nudgeCanvasLayouts,
} from '../src/portfolio/canvasLayout';
import { parseAndMigrateContent } from '../src/lib/content';
import { blankContent } from '../src/editor/lib/content-init';

describe('canvas edge bleed clamps', () => {
	it('keeps already-in-bounds layouts untouched (old drafts are unchanged)', () => {
		const layout = { x: 12.5, y: 40, w: 30, ar: 1.5 };
		expect(clampLayout(layout)).toEqual(layout);
		const text = { x: 0, y: 0, w: 100 };
		expect(clampTextLayout(text)).toEqual(text);
	});

	it('allows bleeding past the left edge by up to half the width', () => {
		expect(clampLayout({ x: -15, y: 0, w: 30, ar: 1 }).x).toBe(-15);
		expect(clampLayout({ x: -15.01, y: 0, w: 30, ar: 1 }).x).toBe(-15);
		expect(clampLayout({ x: -80, y: 0, w: 30, ar: 1 }).x).toBe(-15);
	});

	it('allows bleeding past the right edge by up to half the width', () => {
		expect(clampLayout({ x: 85, y: 0, w: 30, ar: 1 }).x).toBe(85);
		expect(clampLayout({ x: 90, y: 0, w: 30, ar: 1 }).x).toBe(85);
		expect(clampLayout({ x: 500, y: 0, w: 30, ar: 1 }).x).toBe(85);
	});

	it('an item can never fully escape: the sliver inside is at least MIN_W/2', () => {
		const smallest = clampLayout({ x: -999, y: 0, w: MIN_W, ar: 1 });
		// Visible sliver from the left edge = x + w.
		expect(smallest.x + smallest.w).toBeGreaterThanOrEqual(MIN_W / 2);
		const farRight = clampLayout({ x: 999, y: 0, w: MIN_W, ar: 1 });
		expect(100 - farRight.x).toBeGreaterThanOrEqual(MIN_W / 2);
	});

	it('still clamps y at the top and width to the canvas', () => {
		const clamped = clampLayout({ x: 0, y: -5, w: 150, ar: 1 });
		expect(clamped.y).toBe(0);
		expect(clamped.w).toBe(100);
		// A full-width item may still hang half off either side.
		expect(clampLayout({ x: -50, y: 0, w: 100, ar: 1 }).x).toBe(-50);
		expect(clampLayout({ x: 50, y: 0, w: 100, ar: 1 }).x).toBe(50);
	});

	it('clamps text placements with the same side allowance', () => {
		expect(clampTextLayout({ x: -10, y: 2, w: 20 }).x).toBe(-10);
		expect(clampTextLayout({ x: -11, y: 2, w: 20 }).x).toBe(-10);
		expect(clampTextLayout({ x: 95, y: 2, w: 20 }).x).toBe(90);
	});

	it('bounds eastward and westward resizes at half-out', () => {
		// Anchored at x=80, the right edge may reach 120 (half of w=40 outside).
		expect(maxWEastOf(80)).toBe(40);
		// Bleeding-left anchors can grow to the full canvas width.
		expect(maxWEastOf(-20)).toBe(100);
		// Right edge fixed at 30: growing west, x = 30 - w >= -w/2 caps w at 60.
		expect(maxWWestOf(30)).toBe(60);
		expect(maxWWestOf(80)).toBe(100);
	});
});

describe('canvas edge bleed nudges', () => {
	it('lets a single item nudge into the bleed and stops at half-out', () => {
		const [nudged] = nudgeCanvasLayouts([{ x: 0, y: 10, w: 30 }], -10, 0);
		expect(nudged.x).toBe(-10);
		const [pinned] = nudgeCanvasLayouts([{ x: 0, y: 10, w: 30 }], -99, 0);
		expect(pinned.x).toBe(minXFor(30));
		const [right] = nudgeCanvasLayouts([{ x: 60, y: 10, w: 30 }], 99, 0);
		expect(right.x).toBe(maxXFor(30));
	});

	it('shares the tightest allowance across a group and preserves spacing', () => {
		// The narrow item (w=10) only has 5 of left bleed; the wide one has 20.
		const group = [
			{ x: 0, y: 0, w: 10 },
			{ x: 20, y: 10, w: 40 },
		];
		const bounds = canvasDxBounds(group);
		expect(bounds.min).toBe(-5);
		const nudged = nudgeCanvasLayouts(group, -50, 0);
		expect(nudged[0].x).toBe(-5);
		expect(nudged[1].x).toBe(15);
		expect(nudged[1].x - nudged[0].x).toBe(20);
	});

	it('keeps the top edge closed and the bottom open', () => {
		const nudged = nudgeCanvasLayouts([{ x: 10, y: 5, w: 20 }], 0, -50);
		expect(nudged[0].y).toBe(0);
		expect(nudgeCanvasLayouts([{ x: 10, y: 5, w: 20 }], 0, 50)[0].y).toBe(55);
	});
});

describe('edge bleed content round-trip', () => {
	it('bleeding placements and the full-bleed flag survive parse + migrate', () => {
		const content = parseAndMigrateContent({
			...blankContent,
			pages: {
				...blankContent.pages,
				home: {
					...blankContent.pages.home,
					sectionBleed: { 'section:main': true },
				},
			},
			galleries: {
				...blankContent.galleries,
				'selected-works': {
					items: {
						'01-blue.jpg': {
							id: 'img-blue',
							title: 'Blue',
							layout: { x: -12.25, y: 0, w: 40, ar: 1.5 },
						},
						'02-red.jpg': {
							id: 'img-red',
							title: 'Red',
							layout: { x: 85, y: 10, w: 30, ar: 1.2 },
						},
					},
				},
			},
		});
		expect(content.pages.home.sectionBleed).toEqual({ 'section:main': true });
		const items = content.galleries['selected-works'].items;
		expect(items['01-blue.jpg'].layout).toMatchObject({ x: -12.25 });
		expect(items['02-red.jpg'].layout).toMatchObject({ x: 85 });
	});
});
