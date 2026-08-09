// Spec 12 — site-level motion vocabulary (theme.motion). The primitives are
// declared per site in the theme, presettable by template JSON, adjusted by one
// Design dial, and must change nothing for documents that never mention them.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAndMigrateContent, type Content, type Theme } from '../src/lib/content';
import { blankContent, cloneContent } from '../src/editor/lib/content-init';
import { contentWithThemePreset } from '../src/editor/lib/templates';
import { presetTokensFromTheme } from '../src/editor/lib/template-studio';
import Gallery from '../src/portfolio/Gallery';
import Portfolio from '../src/portfolio/Portfolio';
import {
	resolveSiteMotion,
	siteMotionRootClass,
	siteSectionMotion,
} from '../src/portfolio/siteMotion';

function motionContent(motion: Theme['motion']): Content {
	const content = cloneContent(blankContent);
	content.site.name = 'Jane Doe';
	if (motion) content.theme.motion = motion;
	const home = content.pages.home;
	const imagesBlock = home.blocks?.[0];
	if (imagesBlock?.type === 'images') imagesBlock.gallery.layout = 'grid';
	return content;
}

const galleries = {
	'selected-works': [
		{ id: 'one', src: '/assets/selected-works/01.jpg', alt: 'Blue painting', title: 'Blue No. 1' },
		{ id: 'two', src: '/assets/selected-works/02.jpg', alt: 'Red painting' },
	],
	art: [],
	photography: [],
};

function renderHome(content: Content): string {
	return renderToStaticMarkup(
		createElement(Portfolio, { page: 'home', base: '/', content, galleries }),
	);
}

describe('site motion vocabulary', () => {
	it('resolves absent and off to null so old sites render exactly as today', () => {
		expect(resolveSiteMotion(undefined)).toBeNull();
		expect(resolveSiteMotion({})).toBeNull();
		expect(resolveSiteMotion({ intensity: 'off', reveal: true, stagger: true })).toBeNull();
	});

	it('defaults the house primitives on and the opt-in ones off', () => {
		expect(resolveSiteMotion({ intensity: 'subtle' })).toEqual({
			intensity: 'subtle',
			reveal: true,
			hover: true,
			hoverCaptions: false,
			heroParallax: false,
			stagger: true,
		});
		expect(siteMotionRootClass(resolveSiteMotion({ intensity: 'subtle' }))).toBe(
			'motion-site-subtle motion-site-hover motion-site-stagger',
		);
		expect(siteMotionRootClass(null)).toBe('');
		expect(
			resolveSiteMotion({ intensity: 'full', reveal: false, hoverCaptions: true, heroParallax: true }),
		).toMatchObject({ reveal: false, hover: true, hoverCaptions: true, heroParallax: true });
	});

	it('derives section motion: hero drift when parallax is on, reveal elsewhere', () => {
		const full = resolveSiteMotion({ intensity: 'full', heroParallax: true });
		expect(siteSectionMotion(full, true)).toEqual({ effect: 'drift', intensity: 32, phone: false });
		expect(siteSectionMotion(full, false)).toEqual({ effect: 'reveal', intensity: 45, phone: true });
		const subtle = resolveSiteMotion({ intensity: 'subtle' });
		expect(siteSectionMotion(subtle, true)).toEqual({ effect: 'reveal', intensity: 24, phone: true });
		expect(siteSectionMotion(null, false)).toBeUndefined();
		expect(siteSectionMotion(resolveSiteMotion({ intensity: 'subtle', reveal: false }), false)).toBeUndefined();
	});

	it('round-trips theme.motion through the content schema without a version bump', () => {
		const content = motionContent({
			intensity: 'subtle',
			reveal: true,
			hover: false,
			hoverCaptions: true,
			heroParallax: true,
			stagger: false,
		});
		const parsed = parseAndMigrateContent(content);
		expect(parsed.theme.motion).toEqual(content.theme.motion);
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
		const legacy = parseAndMigrateContent(motionContent(undefined));
		expect('motion' in legacy.theme).toBe(false);
		expect(parseAndMigrateContent(legacy)).toEqual(legacy);
	});

	it('renders no motion markup at all when the theme does not declare it', () => {
		const markup = renderHome(motionContent(undefined));
		expect(markup).not.toContain('motion-site-');
		expect(markup).not.toContain('data-motion-effect');
	});

	it('renders root classes and derived section attributes when motion is on', () => {
		const markup = renderHome(motionContent({ intensity: 'subtle' }));
		expect(markup).toContain('motion-site-subtle');
		expect(markup).toContain('motion-site-hover');
		expect(markup).toContain('motion-site-stagger');
		expect(markup).not.toContain('motion-site-captions');
		expect(markup).toContain('data-motion-effect="reveal"');
		// Reveal is a decoration: the SSR HTML itself never hides content — the
		// runtime opts in after hydration via the motion-runtime-ready class.
		expect(markup).not.toContain('motion-runtime-ready');
	});

	it('puts the drift primitive on the first part when heroParallax is declared', () => {
		const markup = renderHome(
			motionContent({ intensity: 'full', heroParallax: true, hoverCaptions: true }),
		);
		expect(markup).toContain('motion-site-captions');
		const firstEffect = /data-motion-effect="(\w+)"/.exec(markup);
		expect(firstEffect?.[1]).toBe('drift');
		expect(markup).toContain('data-motion-effect="reveal"');
	});

	it('lets a hand-authored section choice win over the site vocabulary', () => {
		const content = motionContent({ intensity: 'subtle' });
		content.pages.home.sectionMotion = { 'section:main': { effect: 'scrub', intensity: 60 } };
		const markup = renderHome(content);
		expect(markup).toContain('data-motion-effect="scrub"');
		expect(markup).toContain('--motion-strength:60');
	});

	it('always renders hover captions markup, visibility gated by the root class', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: galleries['selected-works'],
				settings: { folder: 'selected-works', alt: 'Works', order: 'asc', layout: 'grid' },
			}),
		);
		expect(markup).toContain('motion-caption');
		expect(markup).toContain('Blue No. 1');
	});

	it('keeps a site’s motion when a theme preset without motion is applied', () => {
		const content = motionContent({ intensity: 'full', stagger: false });
		const preset: Theme = { ...blankContent.theme };
		const applied = contentWithThemePreset(content, preset);
		expect(applied.theme.motion).toEqual({ intensity: 'full', stagger: false });
		const motionPreset: Theme = { ...blankContent.theme, motion: { intensity: 'subtle' } };
		expect(contentWithThemePreset(content, motionPreset).theme.motion).toEqual({
			intensity: 'subtle',
		});
	});

	it('strips motion from saved theme-preset tokens — starters carry motion, presets do not', () => {
		const tokens = presetTokensFromTheme({
			...blankContent.theme,
			motion: { intensity: 'full' },
		});
		expect('motion' in tokens).toBe(false);
	});

	it('flows template-declared motion into an applied starter document unchanged', () => {
		// A starter's content.json carries its whole theme; parse is the boundary
		// every template crosses on its way into the editor.
		const template = motionContent({ intensity: 'full', heroParallax: true });
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(template)));
		expect(parsed.theme.motion).toEqual({ intensity: 'full', heroParallax: true });
	});
});
