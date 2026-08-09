// Spec 18 — smart grid + batch image workflow.
// The mosaic must be a pure function of the doc (publish matches preview), and
// a doc that never touches the smart-grid toggle must keep its classic uniform
// grid exactly as before.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Gallery from '../src/portfolio/Gallery';
import {
	DEFAULT_GRID_GAP,
	gridGap,
	lastRowSpacer,
	packSmartRows,
	rowTargetSum,
	seededUnit,
	smartGridLayouts,
	wallJitter,
} from '../src/portfolio/smartGrid';
import { GUTTER } from '../src/portfolio/canvasLayout';
import { parseAndMigrateContent } from '../src/lib/content-schema';
import { blankContent } from '../src/editor/lib/content-init';
import type { GalleryConfig } from '../src/lib/content';
import type { ResolvedImage } from '../src/portfolio/types';

const image = (id: string, ar: number, extra: Partial<ResolvedImage> = {}): ResolvedImage => ({
	id,
	src: `/assets/test/${id}.jpg`,
	alt: id,
	ar,
	...extra,
});

const gridSettings = (extra: Partial<GalleryConfig> = {}): GalleryConfig => ({
	folder: 'test',
	alt: 'Test',
	order: 'asc',
	layout: 'grid',
	columns: 3,
	...extra,
});

const render = (images: ResolvedImage[], settings: GalleryConfig): string =>
	renderToStaticMarkup(createElement(Gallery, { images, alt: 'Test', settings }));

describe('smart row packing', () => {
	it('preserves order and covers every image exactly once', () => {
		const ars = [1.5, 0.7, 1, 2.4, 0.8, 1.1, 0.6, 1.9];
		const rows = packSmartRows(ars, 3);
		expect(rows.flat()).toEqual(ars.map((_, i) => i));
	});

	it('packs squares exactly `columns` per row', () => {
		const rows = packSmartRows(Array(9).fill(1), 3);
		expect(rows.map((row) => row.length)).toEqual([3, 3, 3]);
	});

	it('fits fewer landscapes and more portraits into a row', () => {
		// Overall mean ar 2/3 with cols=3 → target sum 2: the square-heavy rows
		// close early, the portrait tail packs four across.
		const rows = packSmartRows([1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 3);
		expect(rows.map((row) => row.length)).toEqual([2, 3, 4]);
	});

	it('is deterministic', () => {
		const ars = [1.33, 0.75, 1, 1.78, 0.66, 1.5, 1.2, 0.8, 2.35, 1];
		expect(packSmartRows(ars, 4)).toEqual(packSmartRows(ars, 4));
	});

	it('keeps a sparse final row from stretching, and leaves a nearly-full one alone', () => {
		const target = rowTargetSum([1, 1, 1], 3);
		expect(lastRowSpacer([1], target)).toBeCloseTo(2);
		expect(lastRowSpacer([1, 1, 0.9], target)).toBe(0);
	});
});

describe('smart grid freeform adoption', () => {
	it('bakes justified rows: equal heights per row, full width, no overlaps', () => {
		const ars = [1.5, 0.75, 1, 2, 0.6, 1.2, 0.9];
		const layouts = smartGridLayouts(ars, 3);
		expect(layouts).toHaveLength(ars.length);
		layouts.forEach((layout, i) => expect(layout.ar).toBeCloseTo(ars[i]));
		const rows = packSmartRows(ars, 3);
		for (const row of rows) {
			const heights = row.map((i) => layouts[i].w / layouts[i].ar);
			for (const h of heights) expect(h).toBeCloseTo(heights[0], 5);
			// Consecutive items in a row sit side by side with the shared gutter.
			for (let k = 1; k < row.length; k++)
				expect(layouts[row[k]].x).toBeCloseTo(layouts[row[k - 1]].x + layouts[row[k - 1]].w + GUTTER, 5);
		}
		// A full (non-final) row spans the whole canvas.
		const first = rows[0];
		const firstEnd = layouts[first[first.length - 1]];
		expect(firstEnd.x + firstEnd.w).toBeCloseTo(100, 5);
	});
});

describe('gallery wall jitter', () => {
	it('is stable per id and independent of list position', () => {
		expect(wallJitter('img-abc')).toEqual(wallJitter('img-abc'));
		expect(seededUnit('seed')).toBe(seededUnit('seed'));
	});

	it('varies across ids within the calm size band', () => {
		const scales = new Set(
			Array.from({ length: 20 }, (_, i) => wallJitter(`img-${i}`).scale),
		);
		expect(scales.size).toBeGreaterThan(10);
		for (const scale of scales) {
			expect(scale).toBeGreaterThanOrEqual(0.72);
			expect(scale).toBeLessThanOrEqual(1);
		}
	});
});

describe('grid gaps', () => {
	it('defaults to the historic gap and clamps stored values', () => {
		expect(gridGap(undefined)).toBe(DEFAULT_GRID_GAP);
		expect(gridGap(-1)).toBe(0);
		expect(gridGap(99)).toBe(8);
		expect(gridGap(2)).toBe(2);
	});
});

describe('Gallery grid rendering', () => {
	const images = [
		image('a', 1.5),
		image('b', 0.75),
		image('c', 1),
		image('d', 1.78),
		image('e', 0.66),
	];

	it('keeps the classic uniform grid for docs that never touched the toggle', () => {
		const html = render(images, gridSettings());
		expect(html).toContain('uniform-grid');
		expect(html).not.toContain('smart-grid');
		// The historic 1.25rem spacing is the default for both gap variables.
		expect(html).toContain('--gap-x:1.25rem');
		expect(html).toContain('--gap-y:1.25rem');
	});

	it('renders the aspect-aware mosaic when smart grid is on', () => {
		const html = render(images, gridSettings({ smartGrid: true }));
		expect(html).toContain('smart-grid');
		expect(html).not.toContain('uniform-grid');
		expect(html).toContain('smart-row');
		// Flex weights carry each artwork's own ratio — no forced square crops.
		expect(html).toContain('--flex-ar:1.5');
		expect(html).toContain('--flex-ar:0.75');
		expect(html).not.toContain('gallery-wall');
	});

	it('only applies smart grid in grid layout', () => {
		const html = render(images, gridSettings({ layout: undefined, smartGrid: true }));
		expect(html).not.toContain('smart-grid');
	});

	it('renders identical markup on repeat — publish matches preview', () => {
		const settings = gridSettings({ smartGrid: true, galleryWall: true });
		const first = render(images, settings);
		expect(first).toContain('gallery-wall');
		expect(first).toContain('wall-x-');
		expect(render(images, settings)).toBe(first);
	});

	it('honors the independent gap controls', () => {
		const html = render(images, gridSettings({ smartGrid: true, gapX: 2, gapY: 0.5 }));
		expect(html).toContain('--gap-x:2rem');
		expect(html).toContain('--gap-y:0.5rem');
		const uniform = render(images, gridSettings({ gapX: 3, gapY: 0 }));
		expect(uniform).toContain('--gap-x:3rem');
		expect(uniform).toContain('--gap-y:0rem');
	});
});

describe('schema migration', () => {
	it('leaves untouched grid docs uniform and round-trips the new fields', () => {
		const content = structuredClone(blankContent);
		const imagesBlock = (pages: typeof content.pages) => {
			for (const page of Object.values(pages))
				for (const block of page.blocks ?? []) if (block.type === 'images') return block;
			throw new Error('blankContent should contain an images block');
		};
		const gallery = imagesBlock(content.pages).gallery;
		gallery.layout = 'grid';
		gallery.columns = 3;
		delete gallery.smartGrid;

		const migratedGallery = imagesBlock(parseAndMigrateContent(content).pages).gallery;
		expect(migratedGallery.layout).toBe('grid');
		expect(migratedGallery.smartGrid).toBeUndefined();
		expect(migratedGallery.galleryWall).toBeUndefined();
		expect(migratedGallery.gapX).toBeUndefined();
		expect(migratedGallery.gapY).toBeUndefined();

		gallery.smartGrid = true;
		gallery.galleryWall = true;
		gallery.gapX = 2;
		gallery.gapY = 0.5;
		const upgradedGallery = imagesBlock(parseAndMigrateContent(content).pages).gallery;
		expect(upgradedGallery.smartGrid).toBe(true);
		expect(upgradedGallery.galleryWall).toBe(true);
		expect(upgradedGallery.gapX).toBe(2);
		expect(upgradedGallery.gapY).toBe(0.5);
	});
});
