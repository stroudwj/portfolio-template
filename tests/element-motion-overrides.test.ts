// Spec 13 — per-element motion tools — and spec 24's cascade on top of them.
// Every override is a pick from the spec-12 vocabulary plus Inherit: an absent
// entry inherits (section → page → site scene → house feel), an explicit choice
// wins, 'none' pins its scope still, and the Site motion dial is the master
// switch over the whole chain.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAndMigrateContent, type Content, type Theme } from '../src/lib/content';
import { blankContent, cloneContent } from '../src/editor/lib/content-init';
import { STARTER_RECIPES } from '../src/editor/lib/templates';
import { artworkEffectClass } from '../src/portfolio/artworkEffects';
import Gallery from '../src/portfolio/Gallery';
import Portfolio from '../src/portfolio/Portfolio';
import { resolveSectionScene, resolveSiteMotion } from '../src/portfolio/siteMotion';
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

	it('the Site motion dial is the master switch: Off stills hand-authored scenes too', () => {
		const content = motionContent(undefined);
		content.pages.home.sectionMotion = {
			'section:main': { effect: 'sequence', intensity: 45, phone: true },
		};
		const markup = renderHome(content);
		expect(markup).not.toContain('data-motion-effect=');
		expect(markup).not.toContain('motion-effect-');
	});

	it('a page-wide scene fills sections without their own entry, and loses to both', () => {
		const content = motionContent({ intensity: 'subtle' });
		content.pages.home.motion = { effect: 'drift', intensity: 30 };
		const markup = renderHome(content);
		// Heading and main both inherit the page scene instead of the house reveal.
		expect(markup.match(/data-motion-effect="drift"/g)).toHaveLength(2);
		expect(markup).not.toContain('data-motion-effect="reveal"');

		content.pages.home.sectionMotion = { 'section:main': { effect: 'none' } };
		const withOverride = renderHome(content);
		// The section's own choice wins over the page scene.
		expect(withOverride.match(/data-motion-effect="drift"/g)).toHaveLength(1);
	});

	it("a site-wide scene replaces the house feel, and 'none' at page level stills a page", () => {
		const content = motionContent({ intensity: 'full', scene: { effect: 'scrub', intensity: 50 } });
		const markup = renderHome(content);
		expect(markup.match(/data-motion-effect="scrub"/g)).toHaveLength(2);
		expect(markup).not.toContain('data-motion-effect="reveal"');

		content.pages.home.motion = { effect: 'none' };
		const stilled = renderHome(content);
		expect(stilled).not.toContain('data-motion-effect=');
		// The dial stays on: unrelated primitives keep their root classes.
		expect(stilled).toContain('motion-site-full');
	});

	it('round-trips the cascade fields through the schema without a version bump', () => {
		const content = motionContent({ intensity: 'subtle', scene: { effect: 'drift', intensity: 20 } });
		content.pages.home.motion = { effect: 'sequence', intensity: 60, phone: true };
		const before = content.schemaVersion;
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(content)));
		expect(parsed.schemaVersion).toBe(before);
		expect(parsed.theme.motion).toEqual(content.theme.motion);
		expect(parsed.pages.home.motion).toEqual(content.pages.home.motion);
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
	});

	it("conservatory's hand-authored entries resolve identically under the cascade", () => {
		const conservatory = STARTER_RECIPES.find((recipe) => recipe.id === 'conservatory')?.content;
		expect(conservatory).toBeDefined();
		if (!conservatory) return;
		const site = resolveSiteMotion(conservatory.theme.motion);
		expect(site).not.toBeNull();
		let entries = 0;
		for (const page of Object.values(conservatory.pages)) {
			expect(page.motion).toBeUndefined(); // no page scenes were hand-authored
			for (const authored of Object.values(page.sectionMotion ?? {})) {
				entries += 1;
				const resolved = resolveSectionScene(site, authored, page.motion, false);
				if (authored.effect === 'none') expect(resolved).toBeUndefined();
				else expect(resolved).toEqual(authored);
			}
		}
		expect(entries).toBeGreaterThanOrEqual(10);
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
