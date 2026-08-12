import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { registerAsset } from '../src/editor/lib/assets';
import { initDocFromContent, docToPortfolioData } from '../src/editor/lib/content-init';
import { parseAndMigrateEditorDoc } from '../src/editor/lib/doc-schema';
import { buildBundle } from '../src/editor/lib/exporter';
import {
	imageAccessibilityComplete,
	normalizeAccessibleImages,
} from '../src/editor/lib/image-accessibility';
import { entryWithSampleSuccessor } from '../src/editor/lib/sample-lifecycle';
import { samplePublishImpact, stripSamplesForPublish } from '../src/editor/lib/sample-publish';
import { generateStaticSite } from '../src/editor/lib/staticgen/site';
import {
	SAMPLE_ARTWORK,
	WITHDRAWN_SAMPLE_IMAGE,
	sampleArtworkUrl,
	sampleReplacement,
} from '../src/editor/lib/sample-artwork';
import { STROUD_ARTWORKS } from '../src/editor/lib/sample-artwork-stroud';
import {
	AVAILABLE_STARTERS,
	STARTER_RECIPES,
	THEME_PRESETS,
	compatibleThemePresets,
	contentWithThemePreset,
	validateStarterCatalog,
} from '../src/editor/lib/templates';
import {
	SAMPLE_UNAVAILABLE_IMAGE,
	showSampleUnavailable,
} from '../src/portfolio/sampleFallback';
import {
	STARTER_FONT_FACES,
	starterFontEditorPath,
	starterFontForCustomFont,
	starterFontLicenseEditorPath,
} from '../src/editor/lib/starter-fonts';
import { fontFacesCss } from '../src/portfolio/theme';
import { withBase } from '../src/portfolio/types';

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
	let offset = 2;
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		const length = bytes.readUInt16BE(offset + 2);
		if (marker >= 0xc0 && marker <= 0xc3)
			return {
				height: bytes.readUInt16BE(offset + 5),
				width: bytes.readUInt16BE(offset + 7),
			};
		offset += 2 + length;
	}
	throw new Error('JPEG dimensions were not found');
}

describe('discipline-led starter catalog', () => {
	it('validates every ready recipe, media slot, and theme relationship', () => {
		expect(validateStarterCatalog()).toEqual([]);
		// Spec 37: the spec-14 catalog IS the registry. The five pre-catalog
		// starters (painter, photographer, illustrator-designer, works-on-paper,
		// sculptor) were retired from every catalog surface.
		expect(STARTER_RECIPES.map((recipe) => recipe.id)).toEqual([
			'conservatory',
			'masthead',
			'atelier',
			'contact-sheet',
			'runway',
			'promenade',
			'still-room',
			'signal',
			'clearing',
			'marmalade',
		]);
		expect(AVAILABLE_STARTERS.map((starter) => starter.id)).toEqual(
			STARTER_RECIPES.map((recipe) => recipe.id),
		);
		for (const recipe of STARTER_RECIPES) {
			expect(recipe.gallerySpecs.length, `${recipe.name} has no gallery specs`).toBeGreaterThan(0);
			expect(
				recipe.gallerySpecs.every((spec) => spec.slots.length === spec.exactImageCount),
			).toBe(true);
			expect(
				recipe.gallerySpecs
					.flatMap((spec) => spec.slots)
					.every(
						(slot) =>
							!!slot.sampleAssetId &&
							slot.width > 0 &&
							slot.height > 0 &&
							slot.aspectRatio === slot.width / slot.height,
					),
				`${recipe.name} has an unfilled or malformed slot`,
			).toBe(true);
			// Every discipline the picker offers must still reach a template.
			expect(recipe.disciplines.length).toBeGreaterThan(0);
		}
		const disciplines = new Set(STARTER_RECIPES.flatMap((recipe) => recipe.disciplines));
		expect([...disciplines].sort()).toEqual([
			'drawing',
			'illustration-design',
			'painting',
			'photography',
			'sculpture',
		]);
	});

	it('uses the current standalone image-block model in every ready starter', () => {
		for (const starter of AVAILABLE_STARTERS) {
			for (const page of Object.values(starter.content.pages)) {
				expect(page.gallery, `${starter.name} still has a legacy page gallery`).toBeUndefined();
				for (const block of page.blocks ?? [])
					expect(block.type, `${starter.name} still has a legacy gallery block`).not.toBe('gallery');
			}
			const folders = Object.values(starter.content.pages).flatMap((page) =>
				(page.blocks ?? []).flatMap((block) => block.type === 'images' ? [block.gallery.folder] : []),
			);
			expect(new Set(folders)).toEqual(new Set(Object.keys(starter.content.galleries)));
		}
	});

	it('keeps every catalog sample byte-for-byte tied to the rights manifest', () => {
		const referenced = [
			...new Set(
				AVAILABLE_STARTERS.flatMap((starter) =>
					starter.gallerySpecs.flatMap((spec) => spec.slots.map((slot) => slot.sampleAssetId!)),
				),
			),
		];
		expect(referenced.length).toBeGreaterThan(100);
		for (const id of referenced) {
			const artwork = SAMPLE_ARTWORK.get(id)!;
			const bytes = readFileSync(`public/${artwork.url}`);
			expect(jpegDimensions(bytes)).toEqual({ width: artwork.width, height: artwork.height });
			expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(artwork.checksum);
			expect(artwork.rightsProof).toMatch(/^https:\/\//);
			expect(artwork.status).toBe('active');
		}
	});

	// Spec 37 removed the pre-catalog starters from the picker, NOT from the
	// rights catalog: a draft an artist built from one still points at these
	// samples, and must keep rendering and publishing. This is the guard.
	it('keeps retired-starter media cataloged so legacy drafts still render', () => {
		const legacy = [...SAMPLE_ARTWORK.values()].filter((artwork) =>
			/^(painter|photographer|sculptor|works-on-paper)-/.test(artwork.id),
		);
		expect(legacy.length).toBeGreaterThanOrEqual(41);
		for (const artwork of legacy) {
			const bytes = readFileSync(`public/${artwork.url}`);
			expect(jpegDimensions(bytes)).toEqual({ width: artwork.width, height: artwork.height });
			expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(artwork.checksum);
			expect(artwork.rightsProof).toMatch(/^https:\/\//);
			expect(artwork.status).toBe('active');
			expect(sampleArtworkUrl(artwork.id)).toContain(artwork.url);
		}
		// The About-page portrait a Painter draft hangs in profile.image.
		const portrait = SAMPLE_ARTWORK.get('painter-wikimedia-monet-self-portrait-v1')!;
		expect(portrait.source).toBe('Wikimedia Commons');
		expect(portrait.status).toBe('active');
		expect(jpegDimensions(readFileSync(`public/${portrait.url}`))).toEqual({
			width: 1920,
			height: 2423,
		});
	});

	it('keeps the spec-14 batch media byte-for-byte tied to the NGA rights manifest', () => {
		// Slot counts include cross-folder reuses (a sample hung in two rooms).
		const expectedCounts = {
			conservatory: 19,
			masthead: 20,
			atelier: 18,
			'contact-sheet': 16,
			runway: 13,
			promenade: 9,
			clearing: 10,
			marmalade: 13,
		} as const;
		for (const starterId of Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>) {
			const starter = AVAILABLE_STARTERS.find((candidate) => candidate.id === starterId)!;
			const sampleIds = starter.gallerySpecs.flatMap((spec) =>
				spec.slots.map((slot) => slot.sampleAssetId!),
			);
			expect(sampleIds).toHaveLength(expectedCounts[starterId]);
			for (const id of sampleIds) {
				const artwork = SAMPLE_ARTWORK.get(id)!;
				const bytes = readFileSync(`public/${artwork.url}`);
				expect(jpegDimensions(bytes)).toEqual({ width: artwork.width, height: artwork.height });
				expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(artwork.checksum);
				expect(artwork.source).toBe('National Gallery of Art');
				expect(artwork.rightsProof).toBe(
					'https://www.nga.gov/artworks/free-images-and-open-access',
				);
				expect(artwork.objectUrl).toMatch(
					/^https:\/\/www\.nga\.gov\/collection\/art-object-page\.\d+\.html$/,
				);
				expect(artwork.sourceImageUrl).toMatch(
					/^https:\/\/api\.nga\.gov\/iiif\/[0-9a-f-]+\/full\/full\/0\/default\.jpg$/,
				);
				expect(artwork.accessionNumber).not.toBe('');
				expect(artwork.status).toBe('active');
			}
		}
	});

	it('keeps the owner-provided Stroud media byte-for-byte tied to its rights note', () => {
		expect(STROUD_ARTWORKS).toHaveLength(19);
		const filmIds = STROUD_ARTWORKS.filter((artwork) => artwork.id.includes('-film-'));
		expect(filmIds).toHaveLength(10);
		// vj02 is the deliberately skipped double exposure — never cataloged.
		expect(STROUD_ARTWORKS.some((artwork) => artwork.id.includes('-photo-02-'))).toBe(false);
		for (const artwork of STROUD_ARTWORKS) {
			const bytes = readFileSync(`public/${artwork.url}`);
			expect(jpegDimensions(bytes)).toEqual({ width: artwork.width, height: artwork.height });
			expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(artwork.checksum);
			expect(artwork.source).toBe('Artist provided');
			expect(artwork.creator).toBe('William Stroud');
			expect(artwork.credit).toBe(`William Stroud. ${artwork.title}. Courtesy of the artist.`);
			expect(artwork.rightsProof).toContain('William Stroud granted sample-use rights');
			// Not museum works: no accession number or external object page, and
			// the validator must accept that (covered by the validateStarterCatalog
			// expectation above).
			expect(artwork.accessionNumber).toBe('');
			expect(artwork.objectUrl).toBe('');
			expect(artwork.title).not.toMatch(/^(film|vj)\d+$/i);
			expect(artwork.status).toBe('active');
			expect(SAMPLE_ARTWORK.get(artwork.id)).toBe(artwork);
		}
	});

	it('rejects a draft slot that is both an upload and a product sample', () => {
		const doc = initDocFromContent(AVAILABLE_STARTERS[0].content);
		Object.values(doc.galleries)[0][0].assetId = 'browser-upload';
		expect(() => parseAndMigrateEditorDoc(doc)).toThrow(/mutually exclusive/);
	});

	it('fails malformed media contracts and incompatible ready catalogs', () => {
		const clearing = () =>
			structuredClone(STARTER_RECIPES.find((recipe) => recipe.id === 'clearing')!);

		const short = clearing();
		short.gallerySpecs[0].slots.pop();
		expect(validateStarterCatalog([short], THEME_PRESETS, SAMPLE_ARTWORK)).toContain(
			'Clearing / Clearing must contain exactly 6 ordered slots.',
		);

		const incompatible = clearing();
		incompatible.defaultThemeId = 'case-study-paper';
		expect(validateStarterCatalog([incompatible], THEME_PRESETS, SAMPLE_ARTWORK)).toContain(
			'Clearing has an incompatible default theme.',
		);

		const retiring = new Map(SAMPLE_ARTWORK);
		const hung = retiring.get('photography-nga-124992-v1')!;
		retiring.set(hung.id, { ...hung, status: 'retiring', retirementDate: '2026-10-25' });
		expect(validateStarterCatalog([clearing()], THEME_PRESETS, retiring)).toContain(
			'Clearing is ready but references retiring media.',
		);

		const badRights = new Map(SAMPLE_ARTWORK);
		badRights.set(hung.id, { ...hung, rightsProof: '' });
		expect(validateStarterCatalog([], THEME_PRESETS, badRights)).toContain(
			`${hung.id} is missing rights evidence.`,
		);

		const wrongAspect = new Map(SAMPLE_ARTWORK);
		const standin = wrongAspect.get('internal-lifecycle-standin-v1')!;
		wrongAspect.set('wrong-aspect-successor', {
			...hung,
			id: 'wrong-aspect-successor',
			width: 2000,
			height: 1000,
			aspectRatio: 2,
		});
		wrongAspect.set(standin.id, {
			...standin,
			replacementId: 'wrong-aspect-successor',
		});
		expect(validateStarterCatalog([], THEME_PRESETS, wrongAspect)).toContain(
			'internal-lifecycle-standin-v1 replacement differs in aspect ratio by more than 3%.',
		);
	});

	it('joins sample asset urls to every BASE_URL shape with exactly one slash', () => {
		const sample = SAMPLE_ARTWORK.get('painter-aic-14655-v1')!;
		expect(sample.url).not.toMatch(/^\//);
		try {
			vi.stubEnv('BASE_URL', '/');
			expect(sampleArtworkUrl(sample.id)).toBe(`/${sample.url}`);
			vi.stubEnv('BASE_URL', '/portfolio-template');
			expect(sampleArtworkUrl(sample.id)).toBe(`/portfolio-template/${sample.url}`);
			vi.stubEnv('BASE_URL', '/portfolio-template/');
			expect(sampleArtworkUrl(sample.id)).toBe(`/portfolio-template/${sample.url}`);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('exercises expiration, tombstone rendering, and explicit successor opt-in', () => {
		const standin = SAMPLE_ARTWORK.get('internal-lifecycle-standin-v1')!;
		expect(standin.url).toBe('');
		expect(sampleArtworkUrl(standin.id, new Date('2026-07-28'))).toBe(
			WITHDRAWN_SAMPLE_IMAGE,
		);
		expect(sampleReplacement(standin.id)?.id).toBe('painter-aic-14655-v1');

		const original = {
			id: 'standin-entry',
			filename: 'standin.jpg',
			assetId: null,
			sampleAssetId: standin.id,
			meta: {
				title: standin.title,
				alt: standin.alt,
				description: standin.credit,
				link: standin.objectUrl,
				layout: { x: 12, y: 8, w: 30, ar: standin.aspectRatio },
			},
		};
		const beforeOptIn = structuredClone(original);
		const replaced = entryWithSampleSuccessor(original);

		expect(original).toEqual(beforeOptIn);
		expect(replaced.id).toBe(original.id);
		expect(replaced.sampleAssetId).toBe('painter-aic-14655-v1');
		expect(replaced.assetId).toBeNull();
		expect(replaced.meta.layout).toEqual({
			...original.meta.layout,
			ar: SAMPLE_ARTWORK.get('painter-aic-14655-v1')!.aspectRatio,
		});
		expect(replaced.meta.title).toBe('Two Sisters (On the Terrace)');
	});

	it('requires alt text or an explicit decorative choice for every upload', () => {
		const described = {
			file: new File(['pixels'], 'described.jpg', { type: 'image/jpeg' }),
			alt: '  A graphite portrait on cream paper.  ',
			decorative: false,
		};
		const decorative = {
			file: new File(['pixels'], 'texture.jpg', { type: 'image/jpeg' }),
			alt: 'discard this',
			decorative: true,
		};
		expect(imageAccessibilityComplete([{ ...described, alt: '   ' }])).toBe(false);
		expect(() =>
			normalizeAccessibleImages([{ ...described, alt: '' }]),
		).toThrow(/alt text or an explicit decorative choice/i);
		expect(imageAccessibilityComplete([{ ...described, alt: '' }], false)).toBe(true);
		expect(normalizeAccessibleImages([{ ...described, alt: '' }], false)).toEqual([
			{ file: described.file, alt: '', decorative: undefined },
		]);
		expect(normalizeAccessibleImages([described, decorative])).toEqual([
			{ file: described.file, alt: 'A graphite portrait on cream paper.', decorative: undefined },
			{ file: decorative.file, alt: '', decorative: true },
		]);
	});

	it('turns an offline sample fetch into a neutral card without touching uploads', () => {
		const image = { src: 'http://localhost/sample.jpg', srcset: 'sample-2x.jpg 2x' };
		showSampleUnavailable(image);
		expect(image).toEqual({ src: SAMPLE_UNAVAILABLE_IMAGE, srcset: '' });
	});

	it('keeps content intact and generates every allowed Clearing theme sample-free', async () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const original = initDocFromContent(clearing.content);
		original.content.theme.customFonts = [
			{ name: 'Studio Sans', file: 'fonts/studio-sans.woff2' },
		];
		original.fonts['Studio Sans'] = {
			filename: 'studio-sans.woff2',
			assetId: null,
			sampleAssetId: null,
		};
		const structuralSnapshot = structuredClone({
			pages: original.content.pages,
			galleries: original.galleries,
			fonts: original.fonts,
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* runtime asset */', { status: 200 })),
		);
		try {
			for (const preset of compatibleThemePresets(original)) {
				const doc = structuredClone(original);
				doc.content = contentWithThemePreset(doc.content, preset.tokens);
				expect({
					pages: doc.content.pages,
					galleries: doc.galleries,
					fonts: doc.fonts,
				}).toEqual(structuralSnapshot);
				expect(doc.content.theme.customFonts).toEqual(
					original.content.theme.customFonts,
				);

				const bundle = await buildBundle(doc);
				expect(
					JSON.stringify(bundle.contentJson),
				).not.toContain('sampleAssetId');
				const site = await generateStaticSite(bundle, {
					siteUrl: `https://${preset.id}.example`,
					editorBase: 'https://hangwork.art/',
				});
				const home = new TextDecoder().decode(
					site.files.find((file) => file.path === 'index.html')!.bytes,
				);
				expect(home).toContain(preset.tokens.backgroundColor);
				expect(home).toContain(preset.tokens.textColor);
				expect(home).not.toContain('Saint-Cloud');
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('generates all-sample, partially replaced, and explicitly stripped documents safely', async () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const allSamples = initDocFromContent(clearing.content);
		const partial = structuredClone(allSamples);
		const first = partial.galleries.clearing[0];
		first.assetId = registerAsset(
			new Blob(['artist pixels'], { type: 'image/jpeg' }),
			'my-work.jpg',
		);
		first.sampleAssetId = null;
		first.filename = 'my-work.jpg';
		first.meta = {
			title: 'My work',
			alt: 'A cobalt and ochre abstract painting',
			description: '',
			link: '',
			layout: first.meta.layout,
		};
		const stripped = stripSamplesForPublish(allSamples);

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* runtime asset */', { status: 200 })),
		);
		try {
			const scenarios = [
				{ name: 'all-samples', doc: allSamples, expectedImages: 0 },
				{ name: 'partial', doc: partial, expectedImages: 1 },
				{ name: 'stripped', doc: stripped, expectedImages: 0 },
			];
			for (const scenario of scenarios) {
				const bundle = await buildBundle(scenario.doc);
				const items = Object.values(bundle.contentJson.galleries).flatMap(
					(gallery) => Object.keys(gallery.items),
				);
				expect(items).toHaveLength(scenario.expectedImages);
				expect(JSON.stringify(bundle.contentJson)).not.toContain('sampleAssetId');
				const site = await generateStaticSite(bundle, {
					siteUrl: `https://${scenario.name}.example`,
					editorBase: 'https://hangwork.art/',
				});
				const html = site.files
					.filter((file) => file.path.endsWith('.html'))
					.map((file) => new TextDecoder().decode(file.bytes))
					.join('\n');
				expect(html).not.toContain('assets/starters/');
				if (scenario.expectedImages)
					expect(html).toContain('/assets/clearing/01-my-work.jpg');
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reports the exact stripped result and blocks an empty public home page', () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const doc = initDocFromContent(clearing.content);
		doc.content.pages.home.sectionHeights = {
			'block:clearing-images': { desktop: 900, phone: 500 },
		};
		doc.content.pages.home.mobile = {
			mode: 'custom',
			order: ['page:heading', 'block:clearing-images'],
		};
		const impact = samplePublishImpact(doc);
		expect(impact.sampleCount).toBe(10);
		expect(impact.pages.map((page) => page.key)).toEqual(['home', 'index']);
		expect(impact.blockedPages).toEqual([{ key: 'home', label: 'Clearing' }]);

		const stripped = stripSamplesForPublish(doc);
		expect(stripped.galleries.clearing).toEqual([]);
		expect(stripped.content.pages.home.blocks).toEqual([]);
		expect(stripped.content.pages.home.sectionHeights).toBeUndefined();
		expect(stripped.content.pages.home.mobile?.order).toEqual(['page:heading']);
	});

	it('preserves an uploaded replacement while removing every remaining sample', () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const doc = initDocFromContent(clearing.content);
		const replacement = doc.galleries.clearing[0];
		replacement.sampleAssetId = null;
		replacement.assetId = 'local-replacement';
		replacement.filename = 'my-painting.jpg';
		replacement.meta = {
			title: '',
			alt: 'An abstract red and charcoal painting',
			description: '',
			link: '',
			layout: replacement.meta.layout,
		};

		const impact = samplePublishImpact(doc);
		expect(impact.sampleCount).toBe(9);
		expect(impact.blockedPages).toEqual([]);
		const stripped = stripSamplesForPublish(doc);
		expect(stripped.galleries.clearing).toHaveLength(1);
		expect(stripped.galleries.clearing[0].filename).toBe('my-painting.jpg');
		expect(stripped.galleries.index).toEqual([]);
	});
});

// Spec 23: starter webfonts — self-hosted, OFL-only. Every face a starter
// declares must ship from the repo with its license, stay inside the per-site
// budget, and ride the existing custom-font pipeline end to end.
describe('starter webfonts', () => {
	const declared = AVAILABLE_STARTERS.flatMap((starter) =>
		(starter.content.theme.customFonts ?? []).map((font) => ({ starter, font })),
	);

	it('ships every declared face with OFL license evidence, inside the budget', () => {
		expect(declared.length).toBeGreaterThan(0);
		for (const starter of AVAILABLE_STARTERS) {
			const fonts = starter.content.theme.customFonts ?? [];
			expect(fonts.length).toBeLessThanOrEqual(2);
			let siteBytes = 0;
			for (const font of fonts) {
				const face = starterFontForCustomFont(font);
				expect(face, `${starter.id} declares a non-catalog font ${font.name}`).toBeTruthy();
				if (!face) continue;
				expect(font.weight).toBe(face.weight);
				siteBytes += readFileSync(`public/${starterFontEditorPath(face)}`).length;
				const license = readFileSync(`public/${starterFontLicenseEditorPath(face)}`, 'utf8');
				expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
				expect(license).toContain(face.copyright);
			}
			// The spec's ceiling on what fonts may add to a published site.
			expect(siteBytes).toBeLessThanOrEqual(150 * 1024);
		}
	});

	it('backs every catalog face with a real binary and license file', () => {
		for (const face of STARTER_FONT_FACES) {
			expect(readFileSync(`public/${starterFontEditorPath(face)}`).length).toBeGreaterThan(0);
			expect(
				readFileSync(`public/${starterFontLicenseEditorPath(face)}`, 'utf8'),
			).toContain('SIL OPEN FONT LICENSE Version 1.1');
		}
	});

	it('leads the heading stack with the face each starter declares', () => {
		for (const { starter, font } of declared)
			expect(starter.content.theme.headingFontFamily ?? '').toContain(font.name);
	});

	it('emits weight descriptors for faces that declare one, and rejects junk', () => {
		expect(fontFacesCss([{ name: 'A', url: '/a.woff2', weight: '400 800' }])).toContain(
			'font-weight:400 800;',
		);
		expect(fontFacesCss([{ name: 'A', url: '/a.woff2' }])).not.toContain('font-weight');
		expect(fontFacesCss([{ name: 'A', url: '/a.woff2', weight: 'x}injected' }])).not.toContain(
			'injected',
		);
	});

	it('previews a declared face from the editor catalog with its weight range', () => {
		const stillRoom = AVAILABLE_STARTERS.find((starter) => starter.id === 'still-room')!;
		const data = docToPortfolioData(initDocFromContent(stillRoom.content));
		expect(data.fontFaces).toEqual([
			{
				name: 'Playfair Display',
				url: withBase(import.meta.env.BASE_URL, 'assets/starters/fonts/playfair-display.woff2'),
				weight: '400 900',
			},
		]);
	});

	it('publishes bundled faces and their OFL text into the static site', async () => {
		const conservatory = AVAILABLE_STARTERS.find((starter) => starter.id === 'conservatory')!;
		const doc = initDocFromContent(conservatory.content);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const catalog = String(url).match(/\/(assets\/starters\/fonts\/.+)$/);
				if (catalog) return new Response(readFileSync(`public/${catalog[1]}`), { status: 200 });
				return new Response('/* runtime asset */', { status: 200 });
			}),
		);
		try {
			const bundle = await buildBundle(doc);
			const site = await generateStaticSite(bundle, {
				siteUrl: 'https://fonts.example',
				editorBase: 'https://hangwork.art/',
			});
			const paths = site.files.map((file) => file.path);
			expect(paths).toContain('assets/fonts/gilda-display.woff2');
			expect(paths).toContain('assets/fonts/gilda-display-OFL.txt');
			const emitted = site.files.find((file) => file.path === 'assets/fonts/gilda-display.woff2')!;
			expect(emitted.bytes.length).toBe(
				readFileSync('public/assets/starters/fonts/gilda-display.woff2').length,
			);
			// The font is referenced content: it must reach the _hw/files.json
			// inventory so reopening the published site re-downloads it.
			expect(site.assetPaths).toContain('assets/fonts/gilda-display.woff2');
			const home = new TextDecoder().decode(
				site.files.find((file) => file.path === 'index.html')!.bytes,
			);
			expect(home).toContain('@font-face{font-family:"Gilda Display"');
			expect(home).toContain('/assets/fonts/gilda-display.woff2');
			expect(home).toContain('font-display:swap');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	// Every catalog starter declares a bundled face (spec 37 retired the ones
	// that did not), so the no-fonts case is modelled by stripping them — the
	// same shape a blank document has.
	it('a document with no declared fonts publishes exactly as before', async () => {
		const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!;
		const fontless = {
			...clearing,
			content: {
				...clearing.content,
				theme: { ...clearing.content.theme, customFonts: undefined },
			},
		};
		expect(fontless.content.theme.customFonts).toBeUndefined();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* runtime asset */', { status: 200 })),
		);
		try {
			const bundle = await buildBundle(initDocFromContent(fontless.content));
			const site = await generateStaticSite(bundle, {
				siteUrl: 'https://plain.example',
				editorBase: 'https://hangwork.art/',
			});
			expect(site.files.some((file) => file.path.startsWith('assets/fonts/'))).toBe(false);
			const home = new TextDecoder().decode(
				site.files.find((file) => file.path === 'index.html')!.bytes,
			);
			expect(home).not.toContain('@font-face');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
