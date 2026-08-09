import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
	CONTENT_SCHEMA_VERSION,
	ContentValidationError,
	UnsupportedContentVersionError,
	parseAndMigrateContent,
} from '../src/lib/content-schema';
import {
	EDITOR_DOC_VERSION,
	parseAndMigrateEditorDoc,
	UnsupportedEditorDocVersionError,
} from '../src/editor/lib/doc-schema';
import {
	contactEmailFallback,
	contactMailtoHref,
	decodeContactEmail,
	encodeContactEmail,
	encodeEmailPart,
} from '../src/portfolio/contactEmail';
import { buildBundle } from '../src/editor/lib/exporter';
import { blankDoc, existingDoc } from '../src/editor/lib/content-init';
import { registerAsset } from '../src/editor/lib/assets';
import { buildEditorBackup, readEditorBackup } from '../src/editor/lib/backup';
import { collectIssues } from '../src/editor/lib/validation';
import { automaticPhoneOrder } from '../src/portfolio/mobileOrder';
import {
	clampTextFlowLayout,
	formatCanvasPercent,
	nudgeCanvasLayouts,
	pointerInCanvas,
	resolveNudgeStep,
	roundLayout,
	snapSpanToCenter,
	snapSpanToEdges,
} from '../src/portfolio/canvasLayout';
import { backgroundBlockVars } from '../src/portfolio/theme';
import { videoEmbedSrc } from '../src/portfolio/videoEmbed';
import { embedSpec, iframeSrcFromInput } from '../src/portfolio/mediaEmbed';

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));
}

function firstImagesBlock(page: ReturnType<typeof blankDoc>['content']['pages'][string]) {
	const block = page.blocks?.find((candidate) => candidate.type === 'images');
	if (!block || block.type !== 'images') throw new Error('Expected a standalone image block');
	return block;
}

describe('content compatibility', () => {
	it('seeds blank and example sites with the current standalone image-block model', () => {
		for (const doc of [blankDoc(), existingDoc()]) {
			for (const page of Object.values(doc.content.pages)) {
				expect(page.gallery).toBeUndefined();
				expect(page.blocks?.some((block) => block.type === 'gallery')).toBe(false);
			}
			expect(firstImagesBlock(doc.content.pages.home).gallery.folder).toBe('selected-works');
		}
	});

	it('migrates legacy page parts into named section containers without separating pinned canvas content', () => {
		const legacy = structuredClone(blankDoc().content) as unknown as {
			schemaVersion: number;
			pages: Record<string, Record<string, unknown>>;
		};
		legacy.schemaVersion = 4;
		const home = legacy.pages.home;
		delete home.sections;
		home.gallery = { folder: 'selected-works', alt: 'Selected work', order: 'asc', layout: 'freeform' };
		home.blocks = [
			{ id: 'gallery', type: 'gallery' },
			{
				id: 'map',
				type: 'embed',
				kind: 'map',
				url: 'https://www.google.com/maps/place/Space+Needle/',
				layout: { x: 10, y: 30, w: 70, ar: 4 / 3 },
			},
			{
				id: 'copy',
				type: 'text',
				text: 'Visit the studio',
				layout: { x: 20, y: 86, w: 55 },
			},
			{ id: 'divider', type: 'divider' },
		];
		home.sectionColors = {
			'block:gallery': '#eeeeee',
			'block:divider': '#111111',
		};
		home.mobile = {
			mode: 'custom',
			order: ['block:divider', 'block:gallery'],
		};

		const migrated = parseAndMigrateContent(legacy);
		expect(migrated.pages.home.sections).toEqual([
			{
				id: 'main',
				name: 'Main section',
				blockIds: ['gallery', 'map', 'copy'],
			},
			{
				id: 'section-divider',
				name: 'Section 2',
				blockIds: ['divider'],
			},
		]);
		expect(migrated.pages.home.sectionColors).toEqual({
			'section:main': '#eeeeee',
			'section:section-divider': '#111111',
		});
		expect(migrated.pages.home.mobile?.order).toEqual([
			'section:section-divider',
			'section:main',
		]);
	});

	it('keeps the editor and published canvas tie-break order identical', () => {
		expect(
			automaticPhoneOrder([
				{ key: 'video:v', y: 10, kind: 'video', index: 0 },
				{ key: 'text:t', y: 10, kind: 'text', index: 0 },
				{ key: 'image:i', y: 10, kind: 'image', index: 0 },
			]),
		).toEqual(['image:i', 'text:t', 'video:v']);
	});

	it('snaps single and group spans without changing their width', () => {
		expect(snapSpanToCenter(37.9, 24)).toEqual({ value: 38, snapped: true });
		expect(snapSpanToCenter(30, 24)).toEqual({ value: 30, snapped: false });
		expect(snapSpanToEdges(20.8, 30, [20, 70])).toBe(20);
	});

	it('nudges multiple canvas items together and keeps the group inside its edges', () => {
		const layouts = nudgeCanvasLayouts(
			[
				{ x: 1, y: 2, w: 30, ar: 1 },
				{ x: 40, y: 8, w: 50, ar: 2 },
			],
			20,
			-5,
		);
		expect(layouts).toEqual([
			{ x: 11, y: 0, w: 30, ar: 1 },
			{ x: 50, y: 6, w: 50, ar: 2 },
		]);
	});

	it('resolves an arrow-key nudge step from the active guide, falling back to a small default', () => {
		// Square guides with snap on: an exact grid step (100 / n).
		expect(resolveNudgeStep('squares', 8, true, false)).toBe(12.5);
		expect(resolveNudgeStep('squares', 25, true, false)).toBe(4);
		// Snap off, or no guide, or column guides (which shade bands, not a
		// uniform step): the small default, not a jump.
		expect(resolveNudgeStep('squares', 8, false, false)).toBe(1);
		expect(resolveNudgeStep('off', 0, false, false)).toBe(1);
		expect(resolveNudgeStep('columns', 4, true, false)).toBe(1);
		// The big (Alt/Option) modifier scales whichever step applies by 10x.
		expect(resolveNudgeStep('squares', 8, true, true)).toBe(125);
		expect(resolveNudgeStep('off', 0, false, true)).toBe(10);
	});

	it('formats a nudge readout percentage to one decimal, trimmed when exact', () => {
		expect(formatCanvasPercent(40)).toBe('40');
		expect(formatCanvasPercent(12.5)).toBe('12.5');
		expect(formatCanvasPercent(12.54)).toBe('12.5');
		expect(formatCanvasPercent(12.56)).toBe('12.6');
		expect(formatCanvasPercent(0)).toBe('0');
	});

	it('keeps a dragged item under the pointer when its canvas scrolls', () => {
		const start = pointerInCanvas(250, 300, { left: 50, top: 100, width: 1000 });
		const afterScroll = pointerInCanvas(250, 300, { left: 50, top: 20, width: 1000 });
		expect(start).toEqual({ x: 20, y: 20 });
		expect(afterScroll).toEqual({ x: 20, y: 28 });
	});

	it('preserves an image lock while rounding canvas placement', () => {
		expect(roundLayout({ x: 2.345, y: 7.891, w: 30.126, ar: 1.777, z: 1, locked: true })).toEqual({
			x: 2.35,
			y: 7.89,
			w: 30.13,
			ar: 1.78,
			z: 1,
			locked: true,
		});
	});

	it('keeps normal-flow text width and position inside the content area', () => {
		expect(clampTextFlowLayout({ x: 90, w: 40 })).toEqual({ x: 60, w: 40 });
		expect(clampTextFlowLayout({ x: -10, w: 5 })).toEqual({ x: 0, w: 20 });
	});

	it('migrates unversioned content without mutating it or dropping extensions', () => {
		const raw = fixture('content-v0.json') as Record<string, unknown>;
		const original = structuredClone(raw);
		const content = parseAndMigrateContent(raw);

		expect(raw).toEqual(original);
		expect(content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
		expect(content.pages.home.blocks?.map((block) => block.type)).toEqual(['gallery', 'children']);
		expect(content.pages.about.blocks).toEqual([{ id: 'about', type: 'about' }]);
		expect(content.nav.some((item) => item.path === 'about')).toBe(true);
		expect(content.pages.bio).toBeUndefined();
		expect(content.site.headerMode).toBe('name');
		expect(content.pages.work.label).toBe('Work');
		expect(content.site.creative).toEqual({ grain: 5 });
		expect((content.site as unknown as Record<string, unknown>).extensionFlag).toBe('preserve-me');
		expect((content as unknown as Record<string, unknown>).customRoot).toEqual({ kept: true });
	});

	it('is idempotent and rejects content from a future editor', () => {
		const once = parseAndMigrateContent(fixture('content-v0.json'));
		expect(parseAndMigrateContent(once)).toEqual(once);
		expect(() => parseAndMigrateContent({ ...once, schemaVersion: CONTENT_SCHEMA_VERSION + 1 })).toThrow(
			UnsupportedContentVersionError,
		);
	});

	it('preserves the click-through carousel option on image groups', () => {
		const raw = structuredClone(blankDoc().content);
		raw.pages.home.blocks = [
			...(raw.pages.home.blocks ?? []),
			{
				id: 'carousel',
				type: 'images',
				name: 'Process',
				gallery: {
					folder: 'process',
					alt: 'Process images',
					order: 'asc',
					carousel: true,
					carouselFit: 'fill',
					carouselFrame: { x: 8, y: 4, w: 72, ar: 1.5 },
					carouselFreeResize: true,
					carouselMoveImage: true,
					carouselHost: 'gallery',
					carouselShowCount: false,
					carouselShowTitle: true,
					carouselRequireAlt: true,
				},
			},
		];
		raw.galleries.process = {
			items: {
				'01-process.jpg': {
					id: 'process-one',
					focusX: 75,
					focusY: 25,
					cropAspect: '16:9',
				},
			},
		};

		const parsed = parseAndMigrateContent(raw);
		const group = parsed.pages.home.blocks?.find((block) => block.id === 'carousel');
		expect(group?.type === 'images' ? group.gallery : undefined).toMatchObject({
			carousel: true,
			carouselFit: 'fill',
			carouselFrame: { x: 8, y: 4, w: 72, ar: 1.5 },
			carouselFreeResize: true,
			carouselMoveImage: true,
			carouselHost: 'gallery',
			carouselShowCount: false,
			carouselShowTitle: true,
			carouselRequireAlt: true,
		});
		expect(parsed.galleries.process.items['01-process.jpg']).toMatchObject({
			focusX: 75,
			focusY: 25,
			cropAspect: '16:9',
		});
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
	});

	it('validates and publishes an uploaded Shots / scroll video without leaking draft asset ids', async () => {
		const doc = blankDoc();
		const assetId = registerAsset(
			new Blob(['short video bytes'], { type: 'video/mp4' }),
			'studio-pass.mp4',
		);
		doc.content.pages.home.blocks!.push({
			id: 'shots-one',
			type: 'shots',
			src: '',
			assetId,
			filename: 'studio-pass.mp4',
			scrollLength: 320,
			fadeIntoPage: true,
			fadeStart: 42,
			fadeDuration: 18,
			fit: 'contain',
		});

		const parsed = parseAndMigrateContent(doc.content);
		expect(parsed.pages.home.blocks?.find((block) => block.id === 'shots-one')).toMatchObject({
			type: 'shots',
			scrollLength: 320,
			fadeIntoPage: true,
			fadeStart: 42,
			fadeDuration: 18,
			fit: 'contain',
		});

		const bundle = await buildBundle(doc);
		const published = bundle.contentJson.pages.home.blocks?.find(
			(block) => block.id === 'shots-one',
		);
		expect(published?.type).toBe('shots');
		if (published?.type !== 'shots') throw new Error('Shots block was not published');
		expect(published.src).toMatch(/^media\/[a-f0-9]+\/[a-f0-9]+-studio-pass\.mp4$/);
		expect(published.assetId).toBeUndefined();
		expect(published.filename).toBeUndefined();
		expect(published.fadeStart).toBe(42);
		expect(published.fadeDuration).toBe(18);
		expect(bundle.files.some((file) => file.path === `public/${published.src}`)).toBe(true);
	});

	it('preserves structured rich text and independent text-box fonts', () => {
		const raw = structuredClone(blankDoc().content);
		raw.pages.home.blocks = [
			...(raw.pages.home.blocks ?? []),
			{
				id: 'rich-copy',
				type: 'text',
				text: 'Large idea\nDetailed work',
				richText: [
					{
						align: 'center',
						runs: [
							{ text: 'Large ', size: 'heading', fontSize: 54, bold: true },
							{ text: 'idea', size: 'heading', italic: true, underline: true },
						],
					},
					{
						runs: [
							{ text: 'Detailed ', size: 'subheading' },
							{ text: 'work', strike: true },
						],
					},
				],
				fontFamily: 'Georgia, "Times New Roman", serif',
				flowLayout: { x: 18, w: 64 },
				layout: { x: 12, y: 8, w: 42, z: 3 },
			},
		];

		const parsed = parseAndMigrateContent(raw);
		const block = parsed.pages.home.blocks?.find((candidate) => candidate.id === 'rich-copy');
		expect(block?.type === 'text' ? block : undefined).toMatchObject({
			text: 'Large idea\nDetailed work',
			fontFamily: 'Georgia, "Times New Roman", serif',
			flowLayout: { x: 18, w: 64 },
			layout: { x: 12, y: 8, w: 42, z: 3 },
			richText: [
				{
					align: 'center',
					runs: [
						{ text: 'Large ', size: 'heading', fontSize: 54, bold: true },
						{ text: 'idea', size: 'heading', italic: true, underline: true },
					],
				},
				{
					runs: [
						{ text: 'Detailed ', size: 'subheading' },
						{ text: 'work', strike: true },
					],
				},
			],
		});
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
	});

	it('moves schema-3 About routes, internal links, and draft thumbnails to /about', () => {
		const legacy = structuredClone(blankDoc()) as unknown as {
			docVersion: number;
			content: {
				schemaVersion: number;
				site: { headerMode?: string; logo?: string };
				nav: Array<{ path: string }>;
				pages: Record<string, { blocks: Array<Record<string, unknown>> }>;
			};
			pageThumbs: Record<string, { filename: string; assetId: null }>;
		};
		legacy.docVersion = 2;
		legacy.content.schemaVersion = 3;
		delete legacy.content.site.headerMode;
		legacy.content.site.logo = 'Studio Name';
		legacy.content.pages.bio = legacy.content.pages.about;
		delete legacy.content.pages.about;
		legacy.content.nav = legacy.content.nav.map((item) => ({
			...item,
			path: item.path === 'about' ? 'bio' : item.path,
		}));
		legacy.content.pages.home.blocks.push(
			{ id: 'about-link', type: 'button', label: 'About', url: '/bio?from=home' },
			{ id: 'about-text', type: 'text', text: 'Read more', link: '/bio#practice' },
		);
		legacy.pageThumbs.bio = { filename: 'about.jpg', assetId: null };

		const migrated = parseAndMigrateEditorDoc(legacy);
			expect(migrated.docVersion).toBe(4);
		expect(migrated.content.pages.about).toBeDefined();
		expect(migrated.content.pages.bio).toBeUndefined();
		expect(migrated.content.site.headerMode).toBe('text');
		expect(migrated.content.pages.home.blocks).toContainEqual(
			expect.objectContaining({ id: 'about-link', url: '/about?from=home' }),
		);
		expect(migrated.content.pages.home.blocks).toContainEqual(
			expect.objectContaining({ id: 'about-text', link: '/about#practice' }),
		);
			expect(migrated.pageThumbs.about).toEqual({
				filename: 'about.jpg',
				assetId: null,
				sampleAssetId: null,
			});
		expect(migrated.pageThumbs.bio).toBeUndefined();
	});

	it('preserves layout, contrast and responsive-section fields with no schema-version bump', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const withExtras = structuredClone(content) as typeof content;
		withExtras.theme.navStyle = 'pill';
		withExtras.theme.fullscreenMobileMenu = true;
		withExtras.theme.automaticTextContrast = false;
		withExtras.theme.stabilizeNavigation = false;
		withExtras.theme.subheadingScale = 135;
		withExtras.theme.pageHeadingScale = 145;
		withExtras.theme.pageHeadingPosition = 'freeform';
		withExtras.theme.pageHeadingX = 32;
		withExtras.theme.pageHeadingY = 74;
		withExtras.theme.logoPosition = 'freeform';
		withExtras.theme.logoX = 24;
		withExtras.theme.logoY = 86;
		withExtras.theme.navOffsetX = -7;
		withExtras.theme.navOffsetY = 12;
		withExtras.site.footerHeights = { desktop: 180, phone: 120 };
		withExtras.pages.home.background = '#101014';
		withExtras.pages.home.sectionColors = { 'block:gallery': '#e0685b', 'page:heading': '#f7ecc9' };
		withExtras.pages.home.sectionHeights = {
			'page:heading': {
				desktop: 260,
				phone: 180,
				desktopVw: 24,
				phoneVw: 46.15,
				desktopGap: 31,
				phoneGap: 18,
			},
			'block:gallery': { desktop: 720 },
		};

		const parsed = parseAndMigrateContent(withExtras);
		expect(parsed.schemaVersion).toBe(CONTENT_SCHEMA_VERSION); // optional fields → no migration
		expect(parsed.theme.navStyle).toBe('pill');
		expect(parsed.theme.fullscreenMobileMenu).toBe(true);
		expect(parsed.theme.automaticTextContrast).toBe(false);
		expect(parsed.theme.stabilizeNavigation).toBe(false);
		expect(parsed.theme.subheadingScale).toBe(135);
		expect(parsed.theme.pageHeadingScale).toBe(145);
		expect(parsed.theme.pageHeadingPosition).toBe('freeform');
		expect(parsed.theme.pageHeadingX).toBe(32);
		expect(parsed.theme.pageHeadingY).toBe(74);
		expect(parsed.theme.logoPosition).toBe('freeform');
		expect(parsed.theme.logoX).toBe(24);
		expect(parsed.theme.logoY).toBe(86);
		expect(parsed.theme.navOffsetX).toBe(-7);
		expect(parsed.theme.navOffsetY).toBe(12);
		expect(parsed.site.footerHeights).toEqual({ desktop: 180, phone: 120 });
		expect(parsed.pages.home.background).toBe('#101014');
		expect(parsed.pages.home.sectionColors).toEqual({
			'block:gallery': '#e0685b',
			'page:heading': '#f7ecc9',
		});
		expect(parsed.pages.home.sectionHeights).toEqual({
			'page:heading': {
				desktop: 260,
				phone: 180,
				desktopVw: 24,
				phoneVw: 46.15,
				desktopGap: 31,
				phoneGap: 18,
			},
			'block:gallery': { desktop: 720 },
		});
		expect(parseAndMigrateContent(parsed)).toEqual(parsed); // idempotent
	});

	it('uses the identified YouTube embed endpoint for supported link shapes', () => {
		expect(videoEmbedSrc('https://youtu.be/M7lc1UVf-VE')).toBe(
			'https://www.youtube.com/embed/M7lc1UVf-VE',
		);
		expect(videoEmbedSrc('https://www.youtube.com/watch?v=M7lc1UVf-VE')).toBe(
			'https://www.youtube.com/embed/M7lc1UVf-VE',
		);
	});

	it('safely resolves hosted audio players and Google Maps embeds', () => {
		const soundcloud = embedSpec('https://soundcloud.com/example-artist/example-track');
		expect(soundcloud).toMatchObject({
			kind: 'audio',
			provider: 'SoundCloud',
			title: 'SoundCloud audio player',
		});
		expect(new URL(soundcloud!.src).searchParams.get('url')).toBe(
			'https://soundcloud.com/example-artist/example-track',
		);

		const bandcampCode =
			'<iframe style="border: 0; width: 350px; height: 470px;" src="https://bandcamp.com/EmbeddedPlayer/album=314386330/size=large/bgcol=ffffff/linkcol=0687f5/transparent=true/"></iframe>';
		expect(embedSpec(bandcampCode)).toMatchObject({
			kind: 'audio',
			provider: 'Bandcamp',
			aspectRatio: 350 / 470,
		});

		const mapCode =
			'<iframe src="https://www.google.com/maps/embed?pb=!1m18&amp;example=true" width="600" height="450"></iframe>';
		expect(iframeSrcFromInput(mapCode)).toBe(
			'https://www.google.com/maps/embed?pb=!1m18&example=true',
		);
		expect(embedSpec(mapCode)).toMatchObject({
			kind: 'map',
			provider: 'Google Maps',
			aspectRatio: 4 / 3,
		});
		expect(embedSpec('https://www.google.com/maps/place/Space+Needle/')).toMatchObject({
			kind: 'map',
			provider: 'Google Maps',
		});
		expect(embedSpec('<iframe src="https://example.com/not-allowed"></iframe>')).toBeNull();
	});

	it('preserves normal-flow sizing for hosted players and maps', () => {
		const raw = structuredClone(blankDoc().content);
		raw.pages.home.blocks!.push({
			id: 'studio-map',
			type: 'embed',
			kind: 'map',
			url: 'https://www.google.com/maps/place/Space+Needle/',
			flowLayout: { x: 12, w: 76 },
		});
		const parsed = parseAndMigrateContent(raw);
		expect(
			parsed.pages.home.blocks?.find((block) => block.id === 'studio-map'),
		).toMatchObject({
			type: 'embed',
			flowLayout: { x: 12, w: 76 },
		});
		expect(parseAndMigrateContent(parsed)).toEqual(parsed);
	});

	it('can disable derived text colors while retaining a chosen background', () => {
		expect(backgroundBlockVars('#101014')).toMatchObject({
			'--color-bg': '#101014',
			'--color-text': '#f5f5f2',
		});
		expect(backgroundBlockVars('#101014', false)).toEqual({
			'--color-bg': '#101014',
		});
	});

	it('rejects invalid responsive section heights', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const invalid = structuredClone(content) as unknown as {
			pages: { home: { sectionHeights: Record<string, { desktop: number }> } };
		};
		invalid.pages.home.sectionHeights = { 'page:heading': { desktop: -1 } };
		expect(() => parseAndMigrateContent(invalid)).toThrow(ContentValidationError);
	});

	it('rejects an unknown nav style value', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const invalid = { ...content, theme: { ...content.theme, navStyle: 'spinny' } };
		expect(() => parseAndMigrateContent(invalid)).toThrow(ContentValidationError);
	});

	it('rejects unknown renderer block types instead of silently deleting them', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const invalid = structuredClone(content) as unknown as { pages: { home: { blocks: unknown[] } } };
		invalid.pages.home.blocks = [{ id: 'future', type: 'future-widget' }];
		expect(() => parseAndMigrateContent(invalid)).toThrow(ContentValidationError);
	});

	it('upgrades schema 1 artwork with stable ids for optional phone arrangements', () => {
		const current = parseAndMigrateContent(fixture('content-v0.json'));
		const legacy = structuredClone(current) as unknown as {
			schemaVersion: number;
			galleries: Record<string, { items: Record<string, { id?: string }> }>;
		};
		legacy.schemaVersion = 1;
		for (const gallery of Object.values(legacy.galleries))
			for (const meta of Object.values(gallery.items)) delete meta.id;

		const first = parseAndMigrateContent(legacy);
		const second = parseAndMigrateContent(legacy);
		const ids = Object.values(first.galleries).flatMap((gallery) =>
			Object.values(gallery.items).map((meta) => meta.id),
		);
		expect(ids.every(Boolean)).toBe(true);
		expect(second).toEqual(first);
	});

	it('normalizes hand-authored schema 2 files without dropping extension data', () => {
		const raw = structuredClone(parseAndMigrateContent(fixture('content-v0.json'))) as unknown as {
			schemaVersion: number;
			customRoot: { kept: boolean };
			pages: Record<string, { blocks?: unknown[]; pageExtension?: string }>;
			galleries: Record<string, { items: Record<string, Record<string, unknown>> }>;
		};
		delete raw.pages.home.blocks;
		raw.pages.home.pageExtension = 'keep-this-too';
		raw.galleries['selected-works'].items['One.jpg'] = {
			title: 'One',
			imageExtension: { cropNote: 'never delete' },
		};
		const original = structuredClone(raw);

		const content = parseAndMigrateContent(raw);

		expect(raw).toEqual(original);
		expect(content.pages.home.blocks?.map((block) => block.type)).toEqual(['gallery', 'children']);
		expect(content.galleries['selected-works'].items['One.jpg'].id).toBe(
			'image-selected-works-one-jpg-1',
		);
		expect((content.pages.home as unknown as Record<string, unknown>).pageExtension).toBe('keep-this-too');
		expect(
			(content.galleries['selected-works'].items['One.jpg'] as unknown as Record<string, unknown>)
				.imageExtension,
		).toEqual({ cropNote: 'never delete' });
		expect((content as unknown as Record<string, unknown>).customRoot).toEqual({ kept: true });
	});
});

describe('browser draft compatibility', () => {
	it('accepts a phone-only page heading position and heals stale gallery item keys', () => {
		const doc = blankDoc();
		doc.content.pages.home.mobile = { mode: 'custom', order: ['page:heading', 'block:selected-works-images'] };
		expect(() => parseAndMigrateEditorDoc(doc)).not.toThrow();
		// A stale image pin (e.g. from a pre-fix template apply) drops the
		// arrangement rather than wedging the draft — see parseAndMigrateEditorDoc.
		firstImagesBlock(doc.content.pages.home).gallery.mobile = { mode: 'custom', order: ['image:missing'] };
		const healed = parseAndMigrateEditorDoc(doc);
		expect(firstImagesBlock(healed.content.pages.home).gallery.mobile).toBeUndefined();
		// The page-level arrangement survives the gallery-level heal (its block
		// key is separately migrated to a section key on parse).
		expect(healed.content.pages.home.mobile?.order?.[0]).toBe('page:heading');
	});

	it('migrates the former public-email fallback into an independent, encoded form delivery email', () => {
		const doc = blankDoc();
		doc.content.contact.email = 'artist@example.com';
		doc.content.pages.home.blocks!.push({
			id: 'contact',
			type: 'form',
			action: '',
			fields: [{ id: 'message', type: 'textarea', label: 'Message', required: true }],
		});

		const parsed = parseAndMigrateEditorDoc(doc);
		const form = parsed.content.pages.home.blocks!.find((block) => block.type === 'form');
		expect(form?.type === 'form' ? decodeContactEmail(form.recipientEmail) : undefined).toBe('artist@example.com');
		// The copied address is stored split + encoded, never as the joined string.
		expect(JSON.stringify(form?.type === 'form' ? form.recipientEmail : undefined)).not.toContain('artist');
		expect(JSON.stringify(form?.type === 'form' ? form.recipientEmail : undefined)).not.toContain('example.com');
		parsed.content.contact.email = '';
		expect(collectIssues(parsed).some((issue) => issue.includes('contact form'))).toBe(false);
		if (form?.type === 'form') form.recipientEmail = undefined;
		expect(collectIssues(parsed).some((issue) => issue.includes('site owner delivery email'))).toBe(true);
	});

	it('encodes a hand-authored form block whose recipientEmail is still a plain string, with no schema-version bump', () => {
		// Pre-fix drafts (and hand-edited content.json) stored the form's delivery
		// inbox as a plain string. A raw, untyped mutation stands in for that legacy
		// shape here since the current PageBlock type no longer allows constructing
		// one directly — see the analogous /bio route-migration test above.
		const legacy = structuredClone(blankDoc()) as unknown as {
			content: {
				pages: Record<string, { blocks: Array<Record<string, unknown>> }>;
			};
		};
		legacy.content.pages.home.blocks.push({
			id: 'legacy-form',
			type: 'form',
			action: '',
			recipientEmail: 'owner@legacy-studio.com',
			fields: [{ id: 'message', type: 'textarea', label: 'Message', required: true }],
		});

		const parsed = parseAndMigrateEditorDoc(legacy);
		const form = parsed.content.pages.home.blocks!.find((block) => block.id === 'legacy-form');
		if (form?.type !== 'form') throw new Error('Expected the form block to survive parsing');

		expect(CONTENT_SCHEMA_VERSION).toBe(5);
		expect(parsed.content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
		expect(typeof form.recipientEmail).not.toBe('string');
		expect(decodeContactEmail(form.recipientEmail)).toBe('owner@legacy-studio.com');
		expect(contactMailtoHref(form.recipientEmail)).toBe('mailto:owner@legacy-studio.com');
		// The stored halves are encoded, never the address itself.
		expect(JSON.stringify(form.recipientEmail)).not.toContain('owner');
		expect(JSON.stringify(form.recipientEmail)).not.toContain('legacy-studio.com');

		// Parsing the parsed document again changes nothing (idempotent, no re-encode).
		expect(parseAndMigrateEditorDoc(parsed).content.pages.home.blocks).toEqual(
			parsed.content.pages.home.blocks,
		);
	});

	it('migrates a v0 draft, backfills registries, and round-trips through export', async () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
		const original = structuredClone(raw);
		const doc = parseAndMigrateEditorDoc(raw);

		expect(raw).toEqual(original);
			expect(doc.docVersion).toBe(4);
		expect(doc.content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
			expect(doc.logoImage).toEqual({ filename: '', assetId: null, sampleAssetId: null });
		expect(doc.resumeFile.filename).toBe('resume.pdf');
			expect(doc.fonts['Draft Font']).toEqual({
				filename: 'draft.woff2',
				assetId: null,
				sampleAssetId: null,
			});
		expect(doc.productImages).toEqual({});
		expect((doc as unknown as Record<string, unknown>).draftExtension).toBe('keep-this');

		const bundle = await buildBundle(doc);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('parses a draft saved before the contact block existed, with no version bump', () => {
		// The contact block is a new member of an optional union: a draft that predates
		// it carries no such block and must still open on the same schema versions.
		const doc = parseAndMigrateEditorDoc(fixture('editor-doc-v0.json'));

		expect(doc.docVersion).toBe(EDITOR_DOC_VERSION);
		expect(EDITOR_DOC_VERSION).toBe(4);
		expect(doc.content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
		expect(CONTENT_SCHEMA_VERSION).toBe(5);
		for (const page of Object.values(doc.content.pages))
			expect(page.blocks?.some((block) => block.type === 'contact')).toBeFalsy();
	});

	it('round-trips a contact block and defaults its button label', () => {
		const doc = blankDoc();
		const email = encodeContactEmail('jane@example.com');
		doc.content.pages.home.blocks = [
			...(doc.content.pages.home.blocks ?? []),
			{
				id: 'contact-1',
				type: 'contact',
				heading: 'Get in touch',
				text: 'Email me about commissions.',
				email,
			},
		];

		const parsed = parseAndMigrateEditorDoc(doc);
		const block = parsed.content.pages.home.blocks?.find((candidate) => candidate.id === 'contact-1');
		if (block?.type !== 'contact') throw new Error('Expected the contact block to survive parsing');

		expect(block.heading).toBe('Get in touch');
		expect(block.text).toBe('Email me about commissions.');
		expect(block.email).toEqual(email);
		// Omitted in the draft above; supplied by the schema default.
		expect(block.buttonLabel).toBe('Email me');
		// The stored halves are encoded, never the address itself.
		expect(JSON.stringify(block.email)).not.toContain('jane');
		expect(JSON.stringify(block.email)).not.toContain('example.com');
		expect(decodeContactEmail(block.email)).toBe('jane@example.com');

		// Parsing the parsed document again changes nothing.
		expect(parseAndMigrateEditorDoc(parsed).content.pages.home.blocks).toEqual(
			parsed.content.pages.home.blocks,
		);
	});

	it('flags a contact block with no usable address before publishing', () => {
		const doc = blankDoc();
		doc.content.pages.home.blocks = [
			...(doc.content.pages.home.blocks ?? []),
			{ id: 'contact-empty', type: 'contact', email: { user: '', domain: '' } },
		];

		expect(collectIssues(doc).some((issue) => issue.includes('contact block'))).toBe(true);

		const withEmail = structuredClone(doc);
		const block = withEmail.content.pages.home.blocks?.find((c) => c.id === 'contact-empty');
		if (block?.type === 'contact') block.email = encodeContactEmail('jane@example.com');
		expect(collectIssues(withEmail).some((issue) => issue.includes('contact block'))).toBe(false);
	});

	it('refuses hand-edited contact halves that could smuggle mail headers', () => {
		// content.json can arrive hand-edited, so the renderer re-validates the pair it
		// rebuilds rather than trusting whatever the halves decode to.
		const injected = {
			user: encodeEmailPart('jane?bcc=harvester'),
			domain: encodeEmailPart('example.com'),
		};
		expect(contactMailtoHref(injected)).toBe('mailto:jane%3Fbcc%3Dharvester@example.com');

		expect(decodeContactEmail({ user: 'zz-not-hex', domain: encodeEmailPart('example.com') })).toBe('');
		expect(contactMailtoHref({ user: '', domain: '' })).toBeUndefined();
		expect(contactEmailFallback(encodeContactEmail('jane@example.com'))).toBe('jane [at] example [dot] com');
	});

	it('rejects future draft versions', () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
			expect(() => parseAndMigrateEditorDoc({ ...raw, docVersion: 5 })).toThrow(UnsupportedEditorDocVersionError);
	});

	it('clears a stale sharing-image choice instead of rejecting the whole draft', () => {
		const doc = blankDoc();
		doc.ogImage = { folder: 'art', entryId: 'deleted-artwork' };

		const upgraded = parseAndMigrateEditorDoc(doc);

		expect(upgraded.ogImage).toBeUndefined();
	});

	it('exports images, thumbnails, fonts, and a résumé with versioned content intact', async () => {
		const doc = blankDoc();
		const asset = (name: string, type: string) => registerAsset(new Blob([name], { type }), name);
		doc.profileImage = { filename: 'profile.jpg', assetId: asset('profile.jpg', 'image/jpeg') };
		doc.logoImage = { filename: 'logo.png', assetId: asset('logo.png', 'image/png') };
		doc.galleries.art = [
			{
				id: 'work-1',
				filename: 'work.png',
				assetId: asset('work.png', 'image/png'),
				meta: { title: 'Work', alt: 'A test artwork', description: '', link: '' },
			},
		];
		doc.pageThumbs.art = { filename: 'thumb.png', assetId: asset('thumb.png', 'image/png') };
		doc.content.theme.customFonts = [{ name: 'Test Font', file: 'fonts/font.woff2' }];
		doc.fonts['Test Font'] = { filename: 'font.woff2', assetId: asset('font.woff2', 'font/woff2') };
		doc.resumeFile = { filename: 'resume.pdf', assetId: asset('resume.pdf', 'application/pdf') };

		const bundle = await buildBundle(doc);
		expect(bundle.files.map((file) => file.path).sort()).toEqual([
			'public/resume.pdf',
			'src/assets/art/01-work.png',
			'src/assets/fonts/font.woff2',
			'src/assets/logo-logo.png',
			'src/assets/profile.jpg',
			'src/assets/thumbs/617274-thumb.png',
		]);
		expect(bundle.contentJson).toMatchObject({
			schemaVersion: CONTENT_SCHEMA_VERSION,
			profile: { image: 'profile.jpg' },
			resume: { url: 'resume.pdf' },
		});
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('leaves draft pages and their image folders out of a published bundle', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.pages.art).toBeUndefined();
		expect(bundle.contentJson.nav.some((item) => item.path === 'art')).toBe(false);
		expect(bundle.contentJson.galleries.art).toBeUndefined();
	});

	it('removes every descendant of a draft page but keeps a gallery shared by a published page', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		doc.content.pages.art.children = ['series'];
		doc.content.pages.art.blocks!.push({ id: 'children', type: 'children' });
		doc.content.pages.series = {
			title: 'Series',
			gallery: { folder: 'series', alt: 'Series artwork', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }, { id: 'children', type: 'children' }],
			children: ['detail'],
		};
		doc.content.pages.detail = {
			title: 'Detail',
			gallery: { folder: 'detail', alt: 'Artwork detail', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		};
		doc.content.galleries.series = { items: {} };
		doc.content.galleries.detail = { items: {} };
		doc.galleries.series = [];
		doc.galleries.detail = [];
		// A live page may intentionally reuse the draft parent's image group.
		firstImagesBlock(doc.content.pages.photography).gallery = { folder: 'art', alt: 'Shared artwork', order: 'asc' };
		doc.galleries.art = [{
			id: 'shared-reference',
			filename: 'shared.jpg',
			assetId: null,
			meta: { title: 'Shared', alt: 'Shared artwork', description: '', link: '' },
		}];

		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.pages.art).toBeUndefined();
		expect(bundle.contentJson.pages.series).toBeUndefined();
		expect(bundle.contentJson.pages.detail).toBeUndefined();
		expect(bundle.contentJson.galleries.series).toBeUndefined();
		expect(bundle.contentJson.galleries.detail).toBeUndefined();
		expect(bundle.contentJson.galleries.art).toBeDefined();
	});

	it('keeps reference-only gallery names and their existing display order', async () => {
		const doc = blankDoc();
		firstImagesBlock(doc.content.pages.art).gallery.order = 'desc';
		doc.galleries.art = [
			{
				id: 'reference-z',
				filename: 'z-last.jpg',
				assetId: null,
				meta: { title: 'Z', alt: 'Z artwork', description: '', link: '' },
			},
			{
				id: 'reference-a',
				filename: 'a-first.jpg',
				assetId: null,
				meta: { title: 'A', alt: 'A artwork', description: '', link: '' },
			},
		];

		const bundle = await buildBundle(doc);

		expect(Object.keys(bundle.contentJson.galleries.art.items)).toEqual(['z-last.jpg', 'a-first.jpg']);
		expect(firstImagesBlock(bundle.contentJson.pages.art).gallery.order).toBe('desc');
		expect(bundle.files.some((file) => file.path.startsWith('src/assets/art/'))).toBe(false);
	});

	it('omits bundled sample images instead of making artists replace them before publishing', async () => {
		const doc = existingDoc();
		doc.galleries.art.push({
			id: 'real-work',
			filename: 'real-work.png',
			assetId: registerAsset(new Blob(['real work'], { type: 'image/png' }), 'real-work.png'),
			meta: { title: 'Real work', alt: '', description: '', link: '' },
		});

		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.profile.image).toBe('');
		expect(bundle.contentJson.galleries['selected-works']).toBeUndefined();
		expect(bundle.contentJson.galleries.photography).toBeUndefined();
		expect(Object.keys(bundle.contentJson.galleries.art.items)).toEqual(['01-real-work.png']);
		expect(bundle.files.map((file) => file.path)).toContain('src/assets/art/01-real-work.png');
	});

	it('does not turn optional image descriptions into publishing reminders', () => {
		const doc = blankDoc();
		doc.galleries.art = [{
			id: 'work-without-description',
			filename: 'work.jpg',
			assetId: 'asset-present',
			meta: { title: 'Work', alt: '', description: '', link: '' },
		}];

		expect(collectIssues(doc).some((issue) => /cannot see|image description/i.test(issue))).toBe(false);
	});

	it('refuses to publish an uploaded-file reference whose pixels are missing', async () => {
		const doc = blankDoc();
		doc.profileImage = { filename: 'lost-profile.png', assetId: 'missing-regression-asset' };

		await expect(buildBundle(doc)).rejects.toThrow(/missing from this browser/i);
	});

	it('refuses a generated file whose path would also be an image-group folder', async () => {
		const doc = blankDoc();
		doc.profileImage = {
			filename: 'art',
			assetId: registerAsset(new Blob(['profile'], { type: 'image/png' }), 'art'),
		};
		doc.galleries.art = [
			{
				id: 'collision-work',
				filename: 'work.png',
				assetId: registerAsset(new Blob(['work'], { type: 'image/png' }), 'work.png'),
				meta: { title: 'Work', alt: 'Work', description: '', link: '' },
			},
		];

		await expect(buildBundle(doc)).rejects.toThrow(/path|folder|rename/i);
	});

	it('gives formerly colliding page keys distinct thumbnail paths', async () => {
		const doc = blankDoc();
		doc.content.pages['a-b'] = { title: 'Dash', blocks: [] };
		doc.content.pages['a/b'] = { title: 'Slash', blocks: [] };
		doc.pageThumbs['a-b'] = {
			filename: 'thumb.png',
			assetId: registerAsset(new Blob(['dash'], { type: 'image/png' }), 'thumb.png'),
		};
		doc.pageThumbs['a/b'] = {
			filename: 'thumb.png',
			assetId: registerAsset(new Blob(['slash'], { type: 'image/png' }), 'thumb.png'),
		};

		const paths = (await buildBundle(doc)).files
			.map((file) => file.path)
			.filter((path) => path.startsWith('src/assets/thumbs/'))
			.sort();

		expect(paths).toEqual([
			'src/assets/thumbs/612d62-thumb.png',
			'src/assets/thumbs/612f62-thumb.png',
		]);
	});

	it('round-trips artwork sizing, click actions, and opt-in phone arrangements', async () => {
		const doc = blankDoc();
		const homeImages = firstImagesBlock(doc.content.pages.home);
		const folder = homeImages.gallery.folder;
		doc.galleries[folder] = [
			{
				id: 'artwork-one',
				filename: 'work.jpg',
				assetId: registerAsset(new Blob(['work'], { type: 'image/jpeg' }), 'work.jpg'),
				meta: {
					title: 'Work',
					alt: 'A red painting on a white wall',
					description: '',
					link: '/art',
					clickAction: 'link',
					cropAspect: '16:9',
					focusX: 30,
					focusY: 70,
					layout: { x: 12, y: 4, w: 28, ar: 1.5, z: 9 },
				},
			},
		];
		homeImages.gallery.mobile = {
			mode: 'custom',
			order: ['image:artwork-one'],
			items: { 'image:artwork-one': { width: 75, align: 'right' } },
		};

		const bundle = await buildBundle(doc);
		const exported = bundle.contentJson.galleries[folder].items['01-work.jpg'];
		expect(exported).toMatchObject({
			id: 'artwork-one',
			alt: 'A red painting on a white wall',
			link: '/art',
			clickAction: 'link',
			cropAspect: '16:9',
			focusX: 30,
			focusY: 70,
			layout: { x: 12, y: 4, w: 28, ar: 1.5, z: 9 },
		});
		expect(firstImagesBlock(bundle.contentJson.pages.home).gallery.mobile).toEqual(homeImages.gallery.mobile);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('round-trips film, page transitions, scroll scenes, and kinetic type', async () => {
		const doc = blankDoc();
		doc.content.site.creative = {
			film: {
				preset: 'projector',
				layer: 'over',
				intensity: 14,
				size: 120,
				speed: 85,
				flicker: true,
				weave: true,
			},
			pageTransition: 'gallery',
		};
		doc.content.pages.home.headingKinetic = { effect: 'words', speed: 90 };
		doc.content.pages.home.sectionMotion = {
			'page:heading': { effect: 'reveal', intensity: 42, phone: true },
			'block:gallery': { effect: 'scrub', intensity: 60 },
		};
		doc.content.pages.home.blocks!.push({
			id: 'kinetic-copy',
			type: 'text',
			text: 'Motion for artists',
			kinetic: { effect: 'letters', speed: 110 },
		});

		const bundle = await buildBundle(doc);
		expect(bundle.contentJson.site.creative).toEqual(doc.content.site.creative);
		expect(bundle.contentJson.pages.home.headingKinetic).toEqual(
			doc.content.pages.home.headingKinetic,
		);
		expect(bundle.contentJson.pages.home.sectionMotion).toEqual(
			doc.content.pages.home.sectionMotion,
		);
		expect(bundle.contentJson.pages.home.blocks).toContainEqual(
			expect.objectContaining({
				id: 'kinetic-copy',
				kinetic: { effect: 'letters', speed: 110 },
			}),
		);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('publishes an uploaded cursor image into its own asset folder', async () => {
		const doc = blankDoc();
		doc.cursorImage = {
			filename: 'paint brush.png',
			assetId: registerAsset(
				new Blob(['cursor pixels'], { type: 'image/png' }),
				'paint brush.png',
			),
			sampleAssetId: null,
		};
		doc.content.site.creative = { cursorImage: 'paint brush.png' };

		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.site.creative).toEqual({
			cursorImage: 'cursors/paint-brush.png',
		});
		expect(bundle.files.map((file) => file.path)).toContain(
			'src/assets/cursors/paint-brush.png',
		);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('puts draft pages and every uploaded asset in an editable backup', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		doc.galleries.art = [
			{
				id: 'draft-work',
				filename: 'draft-work.png',
				assetId: registerAsset(new Blob(['draft pixels'], { type: 'image/png' }), 'draft-work.png'),
				meta: { title: 'Draft', alt: 'Draft artwork', description: '', link: '' },
			},
		];

		const tree = unzipSync(await buildEditorBackup(doc));
		const manifest = JSON.parse(strFromU8(tree['hangwork-backup.json'])) as {
			format: string;
			doc: typeof doc;
			assets: Array<{ id: string; filename: string; path: string }>;
		};

		expect(manifest.format).toBe('hangwork-editor-backup');
		expect(manifest.doc.content.pages.art.draft).toBe(true);
		expect(manifest.assets).toHaveLength(1);
		expect(manifest.assets[0]).toMatchObject({
			id: doc.galleries.art[0].assetId,
			filename: 'draft-work.png',
			path: 'assets/1',
		});
		expect(strFromU8(tree['assets/1'])).toBe('draft pixels');
	});

	it('rejects backup archives with missing or unlisted asset payloads', async () => {
		const doc = blankDoc();
		doc.galleries.art = [
			{
				id: 'backup-work',
				filename: 'backup-work.png',
				assetId: registerAsset(new Blob(['pixels'], { type: 'image/png' }), 'backup-work.png'),
				meta: { title: 'Backup', alt: 'Backup artwork', description: '', link: '' },
			},
		];
		const archive = await buildEditorBackup(doc);

		const missingTree = unzipSync(archive);
		delete missingTree['assets/1'];
		const missing = new File([zipSync(missingTree) as BlobPart], 'missing.zip', {
			type: 'application/zip',
		});
		await expect(readEditorBackup(missing)).rejects.toThrow(/missing/i);

		const extraTree = unzipSync(archive);
		extraTree['assets/unlisted'] = new Uint8Array([1, 2, 3]);
		const extra = new File([zipSync(extraTree) as BlobPart], 'extra.zip', { type: 'application/zip' });
		await expect(readEditorBackup(extra)).rejects.toThrow(/not used|unlisted|unexpected/i);
	});
});
