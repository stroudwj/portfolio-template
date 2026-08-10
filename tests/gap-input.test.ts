// Spec 29 — numeric px input beside the smart-grid gap sliders.
// Gaps are stored in rem; the field speaks px at the browser-default 16px root
// (nothing in the portfolio runtime overrides the root font size). These tests
// lock the conversion contract so a typed px value round-trips exactly and the
// renderer emits the rem the artist's number implies.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Gallery from '../src/portfolio/Gallery';
import { DEFAULT_GRID_GAP } from '../src/portfolio/smartGrid';
import { GAP_PX_MAX, GAP_REM_MAX, gapPxToRem, gapRemToPx } from '../src/editor/lib/gap-units';
import { SliderNumberInput } from '../src/editor/components/ui/controls';
import type { GalleryConfig } from '../src/lib/content';
import type { ResolvedImage } from '../src/portfolio/types';

describe('gap px <-> rem conversion', () => {
	it('maps the slider bounds and the historic default', () => {
		expect(gapRemToPx(0)).toBe(0);
		expect(gapRemToPx(GAP_REM_MAX)).toBe(GAP_PX_MAX);
		expect(GAP_PX_MAX).toBe(64);
		expect(gapRemToPx(DEFAULT_GRID_GAP)).toBe(20);
	});

	it('round-trips every whole px in the field range', () => {
		for (let px = 0; px <= GAP_PX_MAX; px++) {
			expect(gapRemToPx(gapPxToRem(px))).toBe(px);
		}
	});

	it('round-trips every slider step', () => {
		for (let rem = 0; rem <= GAP_REM_MAX; rem += 0.25) {
			expect(gapPxToRem(gapRemToPx(rem))).toBe(rem);
		}
	});
});

describe('typed gap values in the renderer', () => {
	const image = (id: string, ar: number): ResolvedImage => ({
		id,
		src: `/assets/test/${id}.jpg`,
		alt: id,
		ar,
	});
	const images = [image('a', 1), image('b', 1.5), image('c', 0.75)];
	const settings: GalleryConfig = {
		folder: 'test',
		alt: 'Test',
		order: 'asc',
		layout: 'grid',
		columns: 3,
		smartGrid: true,
		// A typed 22px lands off the slider's 0.25rem step grid on purpose.
		gapX: gapPxToRem(22),
		gapY: gapPxToRem(9),
	};

	it('emits the exact rem a typed px value implies', () => {
		const html = renderToStaticMarkup(createElement(Gallery, { images, alt: 'Test', settings }));
		expect(html).toContain('--gap-x:1.375rem');
		expect(html).toContain('--gap-y:0.5625rem');
	});
});

describe('SliderNumberInput', () => {
	it('renders a clamped number input with its unit suffix', () => {
		const html = renderToStaticMarkup(
			createElement(SliderNumberInput, {
				value: 20,
				min: 0,
				max: 64,
				step: 1,
				suffix: 'px',
				ariaLabel: 'Horizontal space, in pixels',
				onChange: () => undefined,
			}),
		);
		expect(html).toContain('type="number"');
		expect(html).toContain('min="0"');
		expect(html).toContain('max="64"');
		expect(html).toContain('aria-label="Horizontal space, in pixels"');
		expect(html).toContain('slider-number-field');
		expect(html).toContain('px');
	});
});
