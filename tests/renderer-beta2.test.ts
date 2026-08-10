// Spec 17 — Beta PT 2 renderer fixes and styling options.
// Bugs: whole-page color vs texture, the false "This page is empty" placeholder,
// per-image hover Still, the carousel widget scrollbox, the square footer box.
// Options (all opt-in, absent = the classic look): link underline toggle,
// text-box background, texture tuning, segment transitions, the mount catalog.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAndMigrateContent, type Content } from '../src/lib/content';
import { blankContent, cloneContent, blankDoc } from '../src/editor/lib/content-init';
import { parseAndMigrateEditorDoc } from '../src/editor/lib/doc-schema';
import { ARTWORK_MOUNTS, artworkEffectClass } from '../src/portfolio/artworkEffects';
import Gallery from '../src/portfolio/Gallery';
import Portfolio from '../src/portfolio/Portfolio';

const MOUNT_VALUES = ARTWORK_MOUNTS.flatMap((mount) => (mount.value ? [mount.value] : []));

function testContent(): Content {
	const content = cloneContent(blankContent);
	content.site.name = 'Jane Doe';
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

describe('whole-page background vs texture', () => {
	it('suppresses the wall texture on a page with an explicit whole-page color', () => {
		const content = testContent();
		content.theme.backgroundTexture = 'concrete';
		content.pages.home.background = '#ffffff';
		const markup = renderHome(content);
		expect(markup).not.toContain('texture-concrete');
		expect(markup).toContain('--color-bg:#ffffff');
	});

	it('keeps the texture on pages without a whole-page color', () => {
		const content = testContent();
		content.theme.backgroundTexture = 'concrete';
		const markup = renderHome(content);
		expect(markup).toContain('texture-concrete');
		expect(markup).not.toContain('texture-tuned');
	});

	it('adds the tuned overlay path only when strength or hue moves off default', () => {
		const content = testContent();
		content.theme.backgroundTexture = 'wood';
		content.theme.textureOpacity = 40;
		content.theme.textureHue = 120;
		const markup = renderHome(content);
		expect(markup).toContain('texture-wood');
		expect(markup).toContain('texture-tuned');
		expect(markup).toContain('--texture-opacity:40');
		expect(markup).toContain('--texture-hue:120');
		content.theme.textureOpacity = 100;
		content.theme.textureHue = 0;
		expect(renderHome(content)).not.toContain('texture-tuned');
	});
});

describe('empty-gallery placeholder', () => {
	it('renders nothing for an empty gallery on a published page', () => {
		const markup = renderToStaticMarkup(createElement(Gallery, { images: [] }));
		expect(markup).toBe('');
	});

	it('keeps the page-empty guidance for the editor', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [],
				settings: { folder: 'art', alt: 'Art', order: 'asc', layout: 'grid' },
				editable: true,
			}),
		);
		expect(markup).toContain('This page is empty');
	});

	it('speaks for a single block, not the page, when told so', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [],
				settings: { folder: 'art', alt: 'Art', order: 'asc', layout: 'grid' },
				editable: true,
				emptyHint: 'This image group is empty… add images to it from the sidebar.',
			}),
		);
		expect(markup).toContain('This image group is empty');
		expect(markup).not.toContain('This page is empty');
	});

	it('stays silent when the hint is suppressed (canvas underneath)', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [],
				settings: { folder: 'art', alt: 'Art', order: 'asc', layout: 'grid' },
				editable: true,
				emptyHint: null,
			}),
		);
		expect(markup).toBe('');
	});
});

describe('per-image hover Still', () => {
	it("emits artwork-hover-none so CSS can exclude the piece from hover motion", () => {
		expect(artworkEffectClass({ src: '/a.jpg', alt: 'A', effects: { hover: 'none' } })).toContain(
			'artwork-hover-none',
		);
	});

	it('places effect classes on the smart-art box, whose direct child is the img', () => {
		const markup = renderToStaticMarkup(
			createElement(Gallery, {
				images: [
					{
						id: 'one',
						src: '/a.jpg',
						alt: 'A',
						ar: 1.5,
						effects: { hover: 'none', mount: 'photo-corners' },
					},
					{ id: 'two', src: '/b.jpg', alt: 'B', ar: 0.8 },
				],
				settings: { folder: 'works', alt: 'Works', order: 'asc', layout: 'grid', smartGrid: true },
			}),
		);
		expect(markup).toMatch(/smart-art artwork-hover-none artwork-mount-photo-corners/);
		expect(markup).not.toMatch(/smart-item[^"]*artwork-hover-none/);
	});
});

describe('styling options', () => {
	it('turns off default link underlines only when asked', () => {
		const content = testContent();
		expect(renderHome(content)).not.toContain('links-no-underline');
		content.theme.linkUnderline = false;
		expect(renderHome(content)).toContain('links-no-underline');
	});

	it('renders a text-box background card with auto-contrast vars', () => {
		const content = testContent();
		content.pages.home.blocks = [
			{ id: 'words', type: 'text', text: 'Commissions open', background: '#141414' },
			...(content.pages.home.blocks ?? []),
		];
		content.pages.home.sections = [
			{ id: 'main', name: 'Main section', blockIds: (content.pages.home.blocks ?? []).map((b) => b.id) },
		];
		const markup = renderHome(content);
		expect(markup).toContain('has-text-background');
		expect(markup).toContain('--color-bg:#141414');
	});

	it('renders segment transitions from the previous section color', () => {
		const content = testContent();
		const home = content.pages.home;
		home.blocks = [
			{ id: 'a', type: 'text', text: 'First' },
			{ id: 'b', type: 'text', text: 'Second' },
		];
		home.sections = [
			{ id: 'main', name: 'Main', blockIds: ['a'] },
			{ id: 's2', name: 'Second', blockIds: ['b'] },
		];
		home.sectionColors = { 'section:main': '#2a2a2a' };
		home.sectionFades = { 'section:s2': 'dither' };
		const markup = renderHome(content);
		expect(markup).toContain('section-fade-dither');
		expect(markup).toContain('--section-fade-from:#2a2a2a');
	});
});

describe('mount catalog', () => {
	it('renders every mount in the catalog as a stable class', () => {
		for (const mount of MOUNT_VALUES)
			expect(artworkEffectClass({ src: '/a.jpg', alt: 'A', effects: { mount } })).toContain(
				`artwork-mount-${mount}`,
			);
	});

	it('round-trips each mount and the new option fields through Content parsing', () => {
		const content = testContent();
		content.theme.textureOpacity = 55;
		content.theme.textureHue = -60;
		content.theme.linkUnderline = false;
		const home = content.pages.home;
		home.sectionFades = { 'section:main': 'fade' };
		home.blocks = [
			{ id: 'words', type: 'text', text: 'Hello', background: '#f6d9d0' },
			...(home.blocks ?? []),
		];
		home.sections = [
			{ id: 'main', name: 'Main section', blockIds: home.blocks.map((b) => b.id) },
		];
		content.galleries['selected-works'] = {
			items: Object.fromEntries(
				MOUNT_VALUES.map((mount, index) => [
					`${index}.jpg`,
					{ id: `piece-${index}`, title: '', alt: '', description: '', link: '', effects: { mount } },
				]),
			),
		};
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(content)));
		expect(parsed.theme.textureOpacity).toBe(55);
		expect(parsed.theme.textureHue).toBe(-60);
		expect(parsed.theme.linkUnderline).toBe(false);
		expect(parsed.pages.home.sectionFades).toEqual({ 'section:main': 'fade' });
		const parsedBlocks = parsed.pages.home.blocks ?? [];
		expect(parsedBlocks[0]).toMatchObject({ type: 'text', background: '#f6d9d0' });
		const items = parsed.galleries['selected-works'].items;
		MOUNT_VALUES.forEach((mount, index) => {
			expect(items[`${index}.jpg`].effects?.mount).toBe(mount);
		});
	});

	it('round-trips hover Still/caption and every mount through the editor draft schema', () => {
		const doc = blankDoc();
		const folder = Object.keys(doc.galleries)[0];
		doc.galleries[folder] = [
			{
				id: 'kept-still',
				filename: 'kept-still.jpg',
				meta: { title: '', alt: '', description: '', link: '', effects: { hover: 'none' } },
				assetId: null,
				sampleAssetId: null,
			},
			{
				id: 'titled',
				filename: 'titled.jpg',
				meta: { title: '', alt: '', description: '', link: '', effects: { hover: 'caption' } },
				assetId: null,
				sampleAssetId: null,
			},
			...MOUNT_VALUES.map((mount, index) => ({
				id: `mounted-${index}`,
				filename: `mounted-${index}.jpg`,
				meta: { title: '', alt: '', description: '', link: '', effects: { mount } },
				assetId: null,
				sampleAssetId: null,
			})),
		];
		const parsed = parseAndMigrateEditorDoc(JSON.parse(JSON.stringify(doc)));
		const entries = parsed.galleries[folder];
		expect(entries[0].meta.effects?.hover).toBe('none');
		expect(entries[1].meta.effects?.hover).toBe('caption');
		MOUNT_VALUES.forEach((mount, index) => {
			expect(entries[index + 2].meta.effects?.mount).toBe(mount);
		});
	});

	it('leaves a draft without any of the new fields untouched', () => {
		const doc = blankDoc();
		const before = JSON.parse(JSON.stringify(doc));
		const parsed = parseAndMigrateEditorDoc(JSON.parse(JSON.stringify(doc)));
		expect(parsed.content.theme.textureOpacity).toBeUndefined();
		expect(parsed.content.theme.linkUnderline).toBeUndefined();
		expect(parsed.content.pages.home.sectionFades).toBeUndefined();
		expect(parsed.docVersion).toBe(before.docVersion);
	});
});
