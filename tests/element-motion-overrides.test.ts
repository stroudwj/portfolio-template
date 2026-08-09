// Spec 13 — per-element motion tools. Every override is a pick from the spec-12
// vocabulary plus Inherit: an absent entry inherits the site feel (so applying
// a template still re-themes motion sitewide), an explicit choice wins, and the
// new 'none' values pin one section or artwork still without touching the rest.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAndMigrateContent, type Content, type Theme } from '../src/lib/content';
import { blankContent, cloneContent } from '../src/editor/lib/content-init';
import { artworkEffectClass } from '../src/portfolio/artworkEffects';
import Gallery from '../src/portfolio/Gallery';
import Portfolio from '../src/portfolio/Portfolio';
import { nextSectionMotion } from '../src/editor/components/ui/SectionMotionPicker';

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

describe('per-section motion overrides', () => {
	it("an explicit 'none' keeps a section still while the site vocabulary stays on", () => {
		const content = motionContent({ intensity: 'subtle' });
		content.pages.home.sectionMotion = {
			'page:heading': { effect: 'none' },
			'section:main': { effect: 'none' },
		};
		const markup = renderHome(content);
		// No section carries motion markup, but the root classes stay: hover and
		// stagger are unrelated primitives and must not turn off with the reveal.
		expect(markup).not.toContain('data-motion-effect=');
		expect(markup).not.toContain('motion-effect-');
		expect(markup).toContain('motion-site-subtle');
	});

	it("'none' on one section leaves the others inheriting the site reveal", () => {
		const content = motionContent({ intensity: 'subtle' });
		content.pages.home.sectionMotion = { 'section:main': { effect: 'none' } };
		const markup = renderHome(content);
		expect(markup.match(/data-motion-effect="reveal"/g)).toHaveLength(1);
		expect(markup.match(/data-motion-effect="/g)).toHaveLength(1);
	});

	it("'none' without any site motion renders exactly like an untouched page", () => {
		const content = motionContent(undefined);
		content.pages.home.sectionMotion = { 'section:main': { effect: 'none' } };
		const markup = renderHome(content);
		expect(markup).not.toContain('data-motion-effect=');
		expect(markup).not.toContain('motion-site-');
	});

	it('round-trips the full effect enum through the schema without a version bump', () => {
		const content = motionContent({ intensity: 'full' });
		content.pages.home.sectionMotion = {
			'page:heading': { effect: 'none' },
			'section:main': { effect: 'sequence', intensity: 45, phone: true },
		};
		const before = content.schemaVersion;
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(content)));
		expect(parsed.schemaVersion).toBe(before);
		expect(parsed.pages.home.sectionMotion).toEqual(content.pages.home.sectionMotion);
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
	});

	it('maps picker choices onto the stored config', () => {
		expect(nextSectionMotion(undefined, '')).toBeUndefined();
		expect(nextSectionMotion({ effect: 'reveal', intensity: 60 }, '')).toBeUndefined();
		expect(nextSectionMotion({ effect: 'reveal', intensity: 60, phone: true }, 'none')).toEqual({
			effect: 'none',
		});
		// Switching between effects keeps the tuned strength and phone opt-in.
		expect(nextSectionMotion({ effect: 'reveal', intensity: 60, phone: true }, 'drift')).toEqual({
			effect: 'drift',
			intensity: 60,
			phone: true,
		});
		expect(nextSectionMotion({ effect: 'none' }, 'reveal')).toEqual({
			effect: 'reveal',
			intensity: 45,
			phone: undefined,
		});
	});
});

describe('per-image hover overrides', () => {
	it('emits the vocabulary classes the site CSS keys on', () => {
		expect(artworkEffectClass({ src: 'a.jpg', alt: '', effects: { hover: 'none' } })).toBe(
			'artwork-hover-none',
		);
		expect(artworkEffectClass({ src: 'a.jpg', alt: '', effects: { hover: 'caption' } })).toBe(
			'artwork-hover-caption',
		);
		expect(artworkEffectClass({ src: 'a.jpg', alt: '' })).toBe('');
	});

	it('renders the override class on gallery items alongside the caption span', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [
					{ ...galleries['selected-works'][0], effects: { hover: 'caption' as const } },
					{ ...galleries['selected-works'][1], effects: { hover: 'none' as const } },
				],
				settings: { folder: 'selected-works', alt: 'Works', order: 'asc', layout: 'grid' },
			}),
		);
		expect(markup).toContain('artwork-hover-caption');
		expect(markup).toContain('artwork-hover-none');
		expect(markup).toContain('motion-caption');
	});

	it('round-trips the new hover values without a version bump', () => {
		const content = motionContent({ intensity: 'subtle' });
		content.galleries['selected-works'] = {
			items: {
				'01.jpg': { id: 'one', effects: { hover: 'caption' } },
				'02.jpg': { id: 'two', effects: { hover: 'none' } },
			},
		};
		const before = content.schemaVersion;
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(content)));
		expect(parsed.schemaVersion).toBe(before);
		expect(parsed.galleries['selected-works']).toEqual(content.galleries['selected-works']);
	});
});
