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
		expect(AVAILABLE_STARTERS.map((starter) => starter.id)).toEqual([
			'painter',
			'photographer',
			'works-on-paper',
			'sculptor',
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
		const photographer = STARTER_RECIPES.find(
			(recipe) => recipe.id === 'photographer',
		)!;
		expect(photographer.gallerySpecs).toHaveLength(3);
		expect(photographer.gallerySpecs.map((spec) => spec.exactImageCount)).toEqual([4, 4, 4]);
		expect(photographer.gallerySpecs.map((spec) => spec.slots.length)).toEqual([4, 4, 4]);
		expect(
			photographer.gallerySpecs
				.flatMap((spec) => spec.slots)
				.every(
					(slot) =>
						!!slot.sampleAssetId &&
						slot.width > 0 &&
						slot.height > 0 &&
						slot.aspectRatio === slot.width / slot.height,
				),
		).toBe(true);

		const illustrator = STARTER_RECIPES.find(
			(recipe) => recipe.id === 'illustrator-designer',
		)!;
		expect(illustrator.gallerySpecs).toHaveLength(3);
		expect(illustrator.gallerySpecs.map((spec) => spec.exactImageCount)).toEqual([4, 4, 4]);
		expect(illustrator.gallerySpecs.map((spec) => spec.slots.length)).toEqual([4, 4, 4]);
		expect(
			illustrator.gallerySpecs
				.flatMap((spec) => spec.slots)
				.every((slot) => !slot.sampleAssetId),
		).toBe(true);
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

	it('keeps local painter copies byte-for-byte tied to the rights manifest', () => {
		const painter = AVAILABLE_STARTERS[0];
		const sampleIds = painter.gallerySpecs.flatMap((spec) =>
			spec.slots.map((slot) => slot.sampleAssetId!),
		);
		expect(sampleIds).toHaveLength(10);
		const institutions = new Set<string>();
		for (const id of sampleIds) {
			const artwork = SAMPLE_ARTWORK.get(id)!;
			const bytes = readFileSync(`public/${artwork.url}`);
			const dimensions = jpegDimensions(bytes);
			institutions.add(artwork.source);
			expect(dimensions).toEqual({ width: artwork.width, height: artwork.height });
			expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(artwork.checksum);
			expect(artwork.rightsProof).toMatch(/^https:\/\//);
			expect(artwork.objectUrl).toMatch(/^https:\/\//);
			expect(artwork.accessionNumber).not.toBe('');
			expect(artwork.status).toBe('active');
		}
		expect(institutions).toEqual(
			new Set(['Art Institute of Chicago', 'The Metropolitan Museum of Art']),
		);
	});

	it('seeds the Painter About page with a traceable public-domain Monet portrait', () => {
		const painter = AVAILABLE_STARTERS.find((starter) => starter.id === 'painter')!;
		const doc = initDocFromContent(painter.content);
		const portrait = SAMPLE_ARTWORK.get('painter-wikimedia-monet-self-portrait-v1')!;
		const bytes = readFileSync(`public/${portrait.url}`);

		expect(doc.profileImage).toEqual({
			filename: '11-claude-monet-self-portrait.jpg',
			assetId: null,
			sampleAssetId: portrait.id,
		});
		expect(docToPortfolioData(doc).profileImageSrc).toContain(portrait.url);
		expect(stripSamplesForPublish(doc).profileImage).toEqual({
			filename: '',
			assetId: null,
			sampleAssetId: null,
		});
		expect(jpegDimensions(bytes)).toEqual({ width: 1920, height: 2423 });
		expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(
			portrait.checksum,
		);
		expect(portrait.source).toBe('Wikimedia Commons');
		expect(portrait.rightsProof).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
		expect(portrait.status).toBe('active');
	});

	it('keeps twelve local public-domain photographs tied to the Met manifest', () => {
		const photographer = AVAILABLE_STARTERS.find(
			(starter) => starter.id === 'photographer',
		)!;
		const sampleIds = photographer.gallerySpecs.flatMap((spec) =>
			spec.slots.map((slot) => slot.sampleAssetId!),
		);
		expect(sampleIds).toHaveLength(12);
		for (const id of sampleIds) {
			const artwork = SAMPLE_ARTWORK.get(id)!;
			const bytes = readFileSync(`public/${artwork.url}`);
			expect(jpegDimensions(bytes)).toEqual({
				width: artwork.width,
				height: artwork.height,
			});
			expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(
				artwork.checksum,
			);
			expect(artwork.source).toBe('The Metropolitan Museum of Art');
			expect(artwork.rightsProof).toBe(
				'https://www.metmuseum.org/policies/image-resources',
			);
			expect(artwork.objectUrl).toMatch(
				/^https:\/\/www\.metmuseum\.org\/art\/collection\/search\/\d+$/,
			);
			expect(artwork.sourceImageUrl).toMatch(
				/^https:\/\/images\.metmuseum\.org\/CRDImages\/ph\/original\//,
			);
			expect(artwork.status).toBe('active');
		}
	});

	it('seeds two exact five-image galleries with explicit sample identity', () => {
		const painter = AVAILABLE_STARTERS[0];
		const doc = initDocFromContent(painter.content);
		expect(doc.galleries['selected-work']).toHaveLength(5);
		expect(doc.galleries.collection).toHaveLength(5);
		expect(
			Object.values(doc.galleries)
				.flat()
				.every((entry) => !!entry.sampleAssetId && !entry.assetId),
		).toBe(true);
		const preview = docToPortfolioData(doc);
		expect(preview.galleries['selected-work'][0].src).toContain(
			'assets/starters/painter/01-two-sisters.jpg',
		);
		// The spec-14 batch presets that also cover {full-bleed, dense, freeform}
		// joined this list when batch 2 landed; the curated pair still leads.
		expect(compatibleThemePresets(doc).map((theme) => theme.id)).toEqual([
			'gallery-linen',
			'night-gallery',
			'studio-white',
			'almond-paper',
			'signal-blue',
			'marmalade-white',
		]);
	});

	it('keeps the Painter selected-work canvas separated and intentional', () => {
		const painter = AVAILABLE_STARTERS.find((starter) => starter.id === 'painter')!;
		const entries = initDocFromContent(painter.content).galleries['selected-work'];
		const layouts = entries.map((entry) => entry.meta.layout!);
		for (let first = 0; first < layouts.length; first += 1) {
			for (let second = first + 1; second < layouts.length; second += 1) {
				const a = layouts[first];
				const b = layouts[second];
				const overlap =
					a.x < b.x + b.w &&
					a.x + a.w > b.x &&
					a.y < b.y + b.w / b.ar &&
					a.y + a.w / a.ar > b.y;
				expect(
					overlap,
					`${entries[first].filename} overlaps ${entries[second].filename}`,
				).toBe(false);
			}
		}
	});

	it('seeds three exact four-image Photographer series and compatible themes', () => {
		const photographer = AVAILABLE_STARTERS.find(
			(starter) => starter.id === 'photographer',
		)!;
		const doc = initDocFromContent(photographer.content);
		expect(Object.fromEntries(
			Object.entries(doc.galleries).map(([folder, entries]) => [folder, entries.length]),
		)).toEqual({
			'yosemite-valley': 4,
			'falls-stone': 4,
			'western-horizons': 4,
		});
		expect(
			Object.values(doc.galleries)
				.flat()
				.every((entry) => !!entry.sampleAssetId && !entry.assetId),
		).toBe(true);
		expect(compatibleThemePresets(doc).map((theme) => theme.id)).toEqual([
			'gallery-linen',
			'night-gallery',
			'studio-white',
			'almond-paper',
			'signal-blue',
			'marmalade-white',
		]);
	});

	it('keeps the new starter media byte-for-byte tied to the rights manifest', () => {
		const expectedCounts = { 'works-on-paper': 10, sculptor: 8 } as const;
		for (const starterId of ['works-on-paper', 'sculptor'] as const) {
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
				expect(artwork.source).toBe('The Metropolitan Museum of Art');
				expect(artwork.rightsProof).toMatch(/^https:\/\//);
				expect(artwork.objectUrl).toMatch(/^https:\/\//);
				expect(artwork.accessionNumber).not.toBe('');
				expect(artwork.status).toBe('active');
			}
		}
	});

	it('keeps the spec-14 batch media byte-for-byte tied to the NGA rights manifest', () => {
		// Slot counts include cross-folder reuses (a sample hung in two rooms).
		const expectedCounts = {
			conservatory: 15,
			masthead: 20,
			atelier: 18,
			'contact-sheet': 13,
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

	// The inverse of the Painter separation test: the pinboard concept REQUIRES
	// overlap, explicit layering, and a mount on every drawing.
	it('keeps the Works on paper wall overlapping and layered on purpose', () => {
		const starter = AVAILABLE_STARTERS.find((candidate) => candidate.id === 'works-on-paper')!;
		const doc = initDocFromContent(starter.content);
		const entries = doc.galleries.wall;
		const layouts = entries.map((entry) => entry.meta.layout!);
		let overlappingPairs = 0;
		for (let first = 0; first < layouts.length; first += 1) {
			for (let second = first + 1; second < layouts.length; second += 1) {
				const a = layouts[first];
				const b = layouts[second];
				const overlap =
					a.x < b.x + b.w &&
					a.x + a.w > b.x &&
					a.y < b.y + b.w / b.ar &&
					a.y + a.w / a.ar > b.y;
				if (overlap) overlappingPairs += 1;
			}
		}
		expect(overlappingPairs).toBeGreaterThanOrEqual(2);
		expect(new Set(layouts.map((layout) => layout.z)).size).toBe(layouts.length);
		expect(entries.every((entry) => !!entry.meta.effects?.mount)).toBe(true);
		// Every spec-14 preset covering {full-bleed, freeform, longform} matches
		// this doc too; the curated pair still leads the list.
		expect(compatibleThemePresets(doc).map((theme) => theme.id)).toEqual([
			'studio-corkboard',
			'vitrine',
			'conservatory-green',
			'poster-white',
			'studio-white',
			'almond-paper',
			'backstage-black',
			'plaster-white',
			'still-cream',
			'signal-blue',
			'marmalade-white',
		]);
	});

	it('keeps the Sculptor halls color-blocked with sparse grids', () => {
		const starter = AVAILABLE_STARTERS.find((candidate) => candidate.id === 'sculptor')!;
		const doc = initDocFromContent(starter.content);
		const home = doc.content.pages.home;
		expect(home.sections).toHaveLength(4);
		expect(Object.keys(home.sectionColors ?? {}).length).toBeGreaterThanOrEqual(2);
		expect(Object.keys(home.sectionMotion ?? {})).toHaveLength(4);
		// dense-grid must never be detected, or the vitrine preset stops matching.
		for (const page of Object.values(doc.content.pages))
			for (const block of page.blocks ?? [])
				if (block.type === 'images' && block.gallery.layout === 'grid')
					expect(block.gallery.columns ?? 3).toBeLessThanOrEqual(2);
		expect(compatibleThemePresets(doc).map((theme) => theme.id)).toEqual([
			'studio-corkboard',
			'vitrine',
			'conservatory-green',
			'poster-white',
			'studio-white',
			'almond-paper',
			'backstage-black',
			'plaster-white',
			'still-cream',
			'signal-blue',
			'marmalade-white',
		]);
	});

	it('rejects a draft slot that is both an upload and a product sample', () => {
		const doc = initDocFromContent(AVAILABLE_STARTERS[0].content);
		doc.galleries['selected-work'][0].assetId = 'browser-upload';
		expect(() => parseAndMigrateEditorDoc(doc)).toThrow(/mutually exclusive/);
	});

	it('fails malformed media contracts and incompatible ready catalogs', () => {
		const painter = structuredClone(
			STARTER_RECIPES.find((recipe) => recipe.id === 'painter')!,
		);
		painter.gallerySpecs[0].slots.pop();
		expect(validateStarterCatalog([painter], THEME_PRESETS, SAMPLE_ARTWORK)).toContain(
			'Painter / Selected Work must contain exactly 5 ordered slots.',
		);

		const incompatible = structuredClone(
			STARTER_RECIPES.find((recipe) => recipe.id === 'painter')!,
		);
		incompatible.defaultThemeId = 'case-study-paper';
		expect(validateStarterCatalog([incompatible], THEME_PRESETS, SAMPLE_ARTWORK)).toContain(
			'Painter has an incompatible default theme.',
		);

		const retiring = new Map(SAMPLE_ARTWORK);
		const active = retiring.get('painter-aic-14655-v1')!;
		retiring.set(active.id, { ...active, status: 'retiring', retirementDate: '2026-10-25' });
		expect(
			validateStarterCatalog(
				[
					structuredClone(
						STARTER_RECIPES.find((recipe) => recipe.id === 'painter')!,
					),
				],
				THEME_PRESETS,
				retiring,
			),
		).toContain('Painter is ready but references retiring media.');

		const badRights = new Map(SAMPLE_ARTWORK);
		badRights.set(active.id, { ...active, rightsProof: '' });
		expect(validateStarterCatalog([], THEME_PRESETS, badRights)).toContain(
			`${active.id} is missing rights evidence.`,
		);

		const wrongAspect = new Map(SAMPLE_ARTWORK);
		const standin = wrongAspect.get('internal-lifecycle-standin-v1')!;
		wrongAspect.set('wrong-aspect-successor', {
			...active,
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

	it('keeps content intact and generates every allowed Painter theme sample-free', async () => {
		const painter = AVAILABLE_STARTERS[0];
		const original = initDocFromContent(painter.content);
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
				expect(home).not.toContain('Two Sisters (On the Terrace)');
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('generates all-sample, partially replaced, and explicitly stripped documents safely', async () => {
		const painter = AVAILABLE_STARTERS[0];
		const allSamples = initDocFromContent(painter.content);
		const partial = structuredClone(allSamples);
		const first = partial.galleries['selected-work'][0];
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
				expect(html).not.toContain('assets/starters/painter/');
				if (scenario.expectedImages)
					expect(html).toContain('/assets/selected-work/01-my-work.jpg');
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reports the exact stripped result and blocks an empty public home page', () => {
		const doc = initDocFromContent(AVAILABLE_STARTERS[0].content);
		doc.content.pages.home.sectionHeights = {
			'block:selected-work-images': { desktop: 900, phone: 500 },
		};
		doc.content.pages.home.mobile = {
			mode: 'custom',
			order: ['page:heading', 'block:selected-work-images'],
		};
		const impact = samplePublishImpact(doc);
		expect(impact.sampleCount).toBe(10);
		expect(impact.pages.map((page) => page.key)).toEqual(['home', 'collection']);
		expect(impact.blockedPages).toEqual([{ key: 'home', label: 'Selected Work' }]);

		const stripped = stripSamplesForPublish(doc);
		expect(stripped.galleries['selected-work']).toEqual([]);
		expect(stripped.content.pages.home.blocks).toEqual([]);
		expect(stripped.content.pages.home.sectionHeights).toBeUndefined();
		expect(stripped.content.pages.home.mobile?.order).toEqual(['page:heading']);
	});

	it('preserves an uploaded replacement while removing every remaining sample', () => {
		const doc = initDocFromContent(AVAILABLE_STARTERS[0].content);
		const replacement = doc.galleries['selected-work'][0];
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
		expect(stripped.galleries['selected-work']).toHaveLength(1);
		expect(stripped.galleries['selected-work'][0].filename).toBe('my-painting.jpg');
		expect(stripped.galleries.collection).toEqual([]);
	});
});
