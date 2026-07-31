import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Gallery from '../src/portfolio/Gallery';
import { PortfolioDivider } from '../src/portfolio/PageBlocks';
import CreativeEffects from '../src/portfolio/CreativeEffects';

describe('physical presentation controls', () => {
	it('renders configurable carousel arrows, frame, color, and artwork mounting', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [
					{
						id: 'mounted-work',
						src: '/work.jpg',
						alt: 'Mounted blue painting',
						effects: { hang: true, skew: 2.5, mount: 'tape' },
					},
					{
						id: 'second-work',
						src: '/work-2.jpg',
						alt: 'Second painting',
					},
				],
				settings: {
					folder: 'works',
					alt: 'Works',
					order: 'asc',
					carousel: true,
					carouselArrowStyle: 'circle',
					carouselFrameStyle: 'mat',
					carouselChromeColor: '#b71c1c',
				},
			}),
		);

		expect(markup).toContain('carousel-arrows-circle');
		expect(markup).toContain('carousel-frame-mat');
		expect(markup).toContain('artwork-hang-on');
		expect(markup).toContain('artwork-mount-tape');
		expect(markup).toContain('--artwork-skew:2.5deg');
		expect(markup).toContain('--carousel-chrome:#b71c1c');
		expect(markup).toContain('aria-label="Show previous image"');
	});

	it('renders divider style, width, and color presets semantically', () => {
		const markup = renderToStaticMarkup(
			createElement(PortfolioDivider, {
				style: 'ornament',
				width: 'short',
				color: '#123456',
			}),
		);
		expect(markup).toContain('role="separator"');
		expect(markup).toContain('style-ornament');
		expect(markup).toContain('width-short');
		expect(markup).toContain('--divider-color:#123456');
		expect(markup).toContain('✦');
	});

	it('keeps the living texture under artwork by default and allows an over-artwork layer', () => {
		const under = renderToStaticMarkup(
			createElement(CreativeEffects, {
				creative: { film: { preset: 'dust', intensity: 10 } },
			}),
		);
		const over = renderToStaticMarkup(
			createElement(CreativeEffects, {
				creative: { film: { preset: 'dust', intensity: 10, layer: 'over' } },
			}),
		);

		expect(under).toContain('creative-background-effects');
		expect(under.indexOf('creative-film')).toBeLessThan(under.indexOf('creative-effects'));
		expect(over).not.toContain('creative-background-effects');
		expect(over).toMatch(/creative-effects[^>]*><canvas[^>]*creative-film/);
	});

	it('renders an uploaded pointer image in the custom cursor overlay', () => {
		const markup = renderToStaticMarkup(
			createElement(CreativeEffects, {
				creative: { cursorImage: 'cursors/paintbrush.png' },
				cursorImageSrc: '/assets/cursors/paintbrush.png',
			}),
		);

		expect(markup).toContain('creative-custom-cursor');
		expect(markup).toContain('src="/assets/cursors/paintbrush.png"');
	});
});
