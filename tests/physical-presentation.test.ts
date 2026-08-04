import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Gallery from '../src/portfolio/Gallery';
import About from '../src/portfolio/About';
import { PortfolioDivider } from '../src/portfolio/PageBlocks';
import CreativeEffects from '../src/portfolio/CreativeEffects';
import Signature from '../src/portfolio/Signature';
import { themeToRootCss, themeToVars } from '../src/portfolio/theme';
import { responsiveHeightVars } from '../src/portfolio/SectionResizeHandle';

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

	it('renders uploaded signatures at the selected alignment', () => {
		const markup = renderToStaticMarkup(
			createElement(Signature, {
				base: '/portfolio-template/',
				data: { strokes: [], image: 'signatures/mark.png', align: 'left' },
			}),
		);
		expect(markup).toContain('site-signature align-left');
		expect(markup).toContain('src="/portfolio-template/signatures/mark.png"');
	});

	it('renders About image crop, size, and focal point controls', () => {
		const markup = renderToStaticMarkup(
			createElement(About, {
				name: 'Artist',
				bio: 'Bio',
				email: 'artist@example.com',
				social: [],
				profileImageSrc: '/portrait.jpg',
				imageWidth: 320,
				imageAspect: '1:1',
				imageFocusX: 25,
				imageFocusY: 70,
				imageCropZoom: 1.5,
			}),
		);
		expect(markup).toContain('profile-image-frame is-cropped');
		expect(markup).toContain('--about-image-width:320px');
		expect(markup).toContain('aspect-ratio:1');
		expect(markup).toContain('object-position:25% 70%');
		expect(markup).toContain('transform:scale(1.5)');
	});

	it('emits separate heading, subheading, and body color variables', () => {
		const theme = {
			backgroundColor: '#ffffff',
			textColor: '#111111',
			bodyTextColor: '#222222',
			headingTextColor: '#333333',
			subheadingTextColor: '#444444',
			mutedTextColor: '#555555',
			accentColor: '#0000ff',
			fontFamily: 'Arial, sans-serif',
			navOffsetX: -6,
			navOffsetY: 9,
		};
		expect(themeToVars(theme)).toMatchObject({
			'--color-body-text': '#222222',
			'--color-heading-text': '#333333',
			'--color-subheading-text': '#444444',
			'--nav-offset-x': '-6px',
			'--nav-offset-y': '9px',
		});
		const css = themeToRootCss(theme);
		expect(css).toContain('--color-body-text:#222222');
		expect(css).toContain('--color-heading-text:#333333');
		expect(css).toContain('--color-subheading-text:#444444');
		expect(css).toContain('--nav-offset-x:-6px');
		expect(css).toContain('--nav-offset-y:9px');
	});

	it('prefers width-relative section heights while retaining legacy pixel fallbacks', () => {
		expect(responsiveHeightVars({ desktop: 470, desktopVw: 32.3, desktopGap: 31, phone: 280 })).toMatchObject({
			'--section-min-desktop': '0px',
			'--section-min-phone': '280px',
			'--section-gap-desktop': '31px',
			'--section-gap-phone': '0px',
		});
		expect(responsiveHeightVars({ desktopGap: -120 }, true)).toMatchObject({
			'--section-gap-desktop': '-120px',
		});
		expect(responsiveHeightVars({ desktopGap: -120 })).toMatchObject({
			'--section-gap-desktop': '0px',
		});
	});
});
