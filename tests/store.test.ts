import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { registerAsset } from '../src/editor/lib/assets';
import { loadPublishedSite } from '../src/editor/lib/account/load';
import { buildEditorBackup } from '../src/editor/lib/backup';
import { blankContent, blankDoc } from '../src/editor/lib/content-init';
import { parseAndMigrateEditorDoc } from '../src/editor/lib/doc-schema';
import { buildBundle } from '../src/editor/lib/exporter';
import type { GitHubClient } from '../src/editor/lib/github/client';
import { loadDocFromRepo } from '../src/editor/lib/github/load';
import {
	generateStaticSite,
	referencedAssetPaths,
} from '../src/editor/lib/staticgen/site';
import { collectIssues } from '../src/editor/lib/validation';
import { uniquePageKey } from '../src/editor/store';
import type { EditorDoc } from '../src/editor/lib/types';
import type { Content, StoreProduct } from '../src/lib/content';
import {
	isTestStripePaymentLink,
	normalizeStripePaymentLink,
	parseStripePaymentLink,
} from '../src/lib/stripe-payment-link';
import { parseAndMigrateContent } from '../src/lib/content-schema';
import PortfolioPage from '../src/portfolio/PortfolioPage';
import Products, { formatProductPrice } from '../src/portfolio/Products';

const LIVE_LINK = 'https://buy.stripe.com/liveAbc123';
const TEST_LINK = 'https://buy.stripe.com/test_abc123';

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
	return {
		id: 'print-1',
		name: 'Blue Monotype',
		description: 'Archival pigment print.',
		imageAlt: 'A blue abstract monotype',
		status: 'available',
		offers: [
			{
				id: 'edition-a',
				label: 'A3 print',
				amountMinor: 12_500,
				checkout: { provider: 'stripe_payment_link', url: LIVE_LINK },
			},
		],
		...overrides,
	};
}

function catalogContent(products: StoreProduct[]): Content {
	const content = structuredClone(blankContent);
	content.store = { currency: 'USD', products };
	return content;
}

function availableProductDoc(overrides: Partial<StoreProduct> = {}): {
	doc: EditorDoc;
	product: StoreProduct;
	assetId: string;
} {
	const doc = blankDoc();
	const entry = product(overrides);
	const assetId = registerAsset(
		new Blob(['product pixels'], { type: 'image/png' }),
		'mockup.png',
	);
	doc.content.store = { currency: 'USD', products: [entry] };
	doc.productImages[entry.id] = { filename: 'mockup.png', assetId };
	return { doc, product: entry, assetId };
}

function normalizedWhitespace(value: string): string {
	return value.replace(/[\u00a0\u202f]/g, ' ');
}

describe('Store content and draft migrations', () => {
	it('chooses the next safe Shop path without overwriting an existing page', () => {
		const pages = structuredClone(blankContent.pages);
		pages.shop = {
			title: 'Existing shop',
			label: 'Existing shop',
			blocks: [],
		};
		pages['shop-2'] = {
			title: 'Second existing shop',
			label: 'Second existing shop',
			blocks: [],
		};

		expect(uniquePageKey('shop', pages)).toBe('shop-3');
		expect(pages.shop.label).toBe('Existing shop');
		expect(pages['shop-2'].label).toBe('Second existing shop');
	});

	it('migrates Content v2 to v3 with USD and preserves extension fields', () => {
		const raw = structuredClone(blankContent) as unknown as Record<string, unknown>;
		raw.schemaVersion = 2;
		raw.catalogExtension = { retained: true };
		raw.store = {
			products: [
				{
					id: 'original-1',
					name: 'Original',
					imageAlt: '',
					status: 'draft',
					offers: [],
					productExtension: 'keep-product-data',
				},
			],
			storeExtension: { retained: 'store' },
		};
		const original = structuredClone(raw);

		const migrated = parseAndMigrateContent(raw);

		expect(raw).toEqual(original);
		expect(migrated.schemaVersion).toBe(3);
		expect(migrated.store?.currency).toBe('USD');
		expect((migrated as unknown as Record<string, unknown>).catalogExtension).toEqual({
			retained: true,
		});
		expect(
			(migrated.store as unknown as Record<string, unknown>).storeExtension,
		).toEqual({ retained: 'store' });
		expect(
			(migrated.store!.products[0] as unknown as Record<string, unknown>)
				.productExtension,
		).toBe('keep-product-data');
	});

	it('rejects duplicate product IDs', () => {
		const content = catalogContent([
			product({ id: 'same-product' }),
			product({ id: 'same-product', name: 'Second work' }),
		]);

		expect(() => parseAndMigrateContent(content)).toThrow(/Product id must be unique/i);
	});

	it('rejects duplicate offer IDs within one product', () => {
		const first = product().offers[0];
		const content = catalogContent([
			product({
				offers: [
					first,
					{ ...first, label: 'Framed', amountMinor: 17_500 },
				],
			}),
		]);

		expect(() => parseAndMigrateContent(content)).toThrow(
			/Offer id must be unique within its product/i,
		);
	});

	it('rejects duplicate and dangling explicit Products-block references', () => {
		const duplicate = catalogContent([product()]);
		duplicate.pages.home.blocks!.push({
			id: 'products',
			type: 'products',
			productIds: ['print-1', 'print-1'],
		});
		expect(() => parseAndMigrateContent(duplicate)).toThrow(
			/Product appears in this block more than once/i,
		);

		const dangling = catalogContent([product()]);
		dangling.pages.home.blocks!.push({
			id: 'products',
			type: 'products',
			productIds: ['missing-product'],
		});
		expect(() => parseAndMigrateContent(dangling)).toThrow(
			/Products block points to a product that does not exist/i,
		);
	});

	it('rejects non-ISO currencies and unsafe product image paths', () => {
		const invalidCurrency = catalogContent([product()]);
		invalidCurrency.store!.currency = 'ZZZ';
		expect(() => parseAndMigrateContent(invalidCurrency)).toThrow(/ISO 4217/i);

		const invalidImage = catalogContent([
			product({ image: 'products/%2e%2e/private.png' }),
		]);
		expect(() => parseAndMigrateContent(invalidImage)).toThrow(/safe path/i);
	});

	it('migrates EditorDoc v1 product paths into v2 reference-only image slots', () => {
		const raw = structuredClone(blankDoc()) as unknown as Record<string, unknown>;
		raw.docVersion = 1;
		delete raw.productImages;
		(raw.content as Content).store = {
			currency: 'USD',
			products: [
				product({
					id: 'original-1',
					status: 'sold_out',
					image: 'products/original-1/framed-original.jpg',
				}),
			],
		};
		raw.draftExtension = { retained: true };
		const original = structuredClone(raw);

		const migrated = parseAndMigrateEditorDoc(raw);

		expect(raw).toEqual(original);
		expect(migrated.docVersion).toBe(2);
		expect(migrated.productImages).toEqual({
			'original-1': { filename: 'framed-original.jpg', assetId: null },
		});
		expect((migrated as unknown as Record<string, unknown>).draftExtension).toEqual({
			retained: true,
		});
	});
});

describe('strict Stripe Payment Links', () => {
	it('recognizes canonical live and test links', () => {
		expect(parseStripePaymentLink(LIVE_LINK)).toEqual({
			url: LIVE_LINK,
			token: 'liveAbc123',
			mode: 'live',
		});
		expect(parseStripePaymentLink(TEST_LINK)).toEqual({
			url: TEST_LINK,
			token: 'test_abc123',
			mode: 'test',
		});
		expect(isTestStripePaymentLink(LIVE_LINK)).toBe(false);
		expect(isTestStripePaymentLink(TEST_LINK)).toBe(true);
	});

	it('keeps approved non-PII parameters while removing duplicates, PII, unknowns, and fragments', () => {
		const normalized = normalizeStripePaymentLink(
			`${LIVE_LINK}?utm_source=studio&utm_source=ignored&utm_campaign=summer` +
				'&client_reference_id=edition-17&locale=fr&prefilled_promo_code=ART10' +
				'&prefilled_email=buyer%40example.com&after_completion=redirect#private-fragment',
		);

		expect(normalized).not.toBeNull();
		const url = new URL(normalized!);
		expect(url.origin + url.pathname).toBe(LIVE_LINK);
		expect([...url.searchParams.entries()]).toEqual([
			['utm_source', 'studio'],
			['utm_campaign', 'summer'],
			['client_reference_id', 'edition-17'],
			['locale', 'fr'],
			['prefilled_promo_code', 'ART10'],
		]);
		expect(url.hash).toBe('');
	});

	it.each([
		['empty value', ''],
		['HTTP', 'http://buy.stripe.com/liveAbc123'],
		['executable scheme', 'javascript:alert(1)'],
		['protocol-relative URL', '//buy.stripe.com/liveAbc123'],
		['lookalike suffix', 'https://buy.stripe.com.evil.example/liveAbc123'],
		['lookalike prefix', 'https://buy-stripe.com/liveAbc123'],
		['credential trick', 'https://buy.stripe.com@evil.example/liveAbc123'],
		['embedded credentials', 'https://artist:secret@buy.stripe.com/liveAbc123'],
		['custom checkout domain', 'https://checkout.artist.example/liveAbc123'],
		['non-default port', 'https://buy.stripe.com:444/liveAbc123'],
		['extra path segment', 'https://buy.stripe.com/liveAbc123/extra'],
		['encoded slash', 'https://buy.stripe.com/liveAbc123%2Fextra'],
		['short token', 'https://buy.stripe.com/abc'],
		['invalid token character', 'https://buy.stripe.com/live-abc123'],
	])('rejects %s', (_label, raw) => {
		expect(parseStripePaymentLink(raw)).toBeNull();
		expect(normalizeStripePaymentLink(raw)).toBeNull();
	});
});

describe('catalog pricing and rendering', () => {
	it('formats integer minor units using USD, JPY, and BHD precision', () => {
		expect(normalizedWhitespace(formatProductPrice(1_234, 'USD', 'en-US'))).toBe(
			'$12.34',
		);
		expect(normalizedWhitespace(formatProductPrice(1_234, 'JPY', 'en-US'))).toBe(
			'¥1,234',
		);
		expect(normalizedWhitespace(formatProductPrice(1_234, 'BHD', 'en-US'))).toBe(
			'BHD 1.234',
		);
	});

	it('renders sold-out products without a checkout anchor', () => {
		const soldOut = product({ status: 'sold_out' });
		const markup = renderToStaticMarkup(
			createElement(Products, {
				store: { currency: 'USD', products: [soldOut] },
				productImageSrcs: { [soldOut.id]: '/assets/sold-out.png' },
				locale: 'en-US',
			}),
		);

		expect(markup).toContain('Sold out');
		expect(markup).not.toMatch(/<a\b/);
		expect(markup).not.toContain('product-buy');
	});

	it('renders a From summary, one safe Stripe link per option, and featured layout', () => {
		const entry = product({
			offers: [
				product().offers[0],
				{
					id: 'edition-b',
					label: 'Framed A3 print',
					amountMinor: 17_500,
					checkout: {
						provider: 'stripe_payment_link',
						url: 'https://buy.stripe.com/liveDef456',
					},
				},
			],
		});
		const markup = renderToStaticMarkup(
			createElement(Products, {
				store: { currency: 'USD', products: [entry] },
				productImageSrcs: { [entry.id]: '/assets/print.png' },
				layout: 'featured',
				locale: 'en-US',
			}),
		);

		expect(markup).toContain('products-featured');
		expect(markup).toContain('From $125.00');
		expect(markup.match(/class="product-buy"/g)).toHaveLength(2);
		expect(markup.match(/target="_blank"/g)).toHaveLength(2);
		expect(markup.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
	});

	it('honors explicit product order while excluding Draft selections', () => {
		const first = product({ id: 'first-product', name: 'First product' });
		const draft = product({
			id: 'draft-product',
			name: 'Draft product',
			status: 'draft',
		});
		const second = product({ id: 'second-product', name: 'Second product' });
		const markup = renderToStaticMarkup(
			createElement(Products, {
				store: { currency: 'USD', products: [first, draft, second] },
				productIds: [second.id, draft.id, first.id],
				locale: 'en-US',
			}),
		);

		expect(markup.indexOf('Second product')).toBeLessThan(
			markup.indexOf('First product'),
		);
		expect(markup).not.toContain('Draft product');
	});
});

describe('Store publishing bundle', () => {
	it('prunes draft products, their assets, and dangling explicit references', async () => {
		const doc = blankDoc();
		const draft = product({
			id: 'draft-print',
			status: 'draft',
			offers: [
				{
					id: 'draft-option',
					label: 'Test option',
					amountMinor: 100,
					checkout: { provider: 'stripe_payment_link', url: TEST_LINK },
				},
			],
		});
		const soldOut = product({
			id: 'sold-original',
			status: 'sold_out',
			offers: [],
		});
		doc.content.store = { currency: 'USD', products: [draft, soldOut] };
		doc.productImages[draft.id] = {
			filename: 'draft.png',
			assetId: registerAsset(
				new Blob(['draft product pixels'], { type: 'image/png' }),
				'draft.png',
			),
		};
		doc.productImages[soldOut.id] = { filename: '', assetId: null };
		doc.content.pages.home.blocks!.push({
			id: 'products',
			type: 'products',
			productIds: [draft.id, soldOut.id],
		});

		const bundle = await buildBundle(doc);
		const productsBlock = bundle.contentJson.pages.home.blocks!.find(
			(block) => block.type === 'products',
		);

		expect(bundle.contentJson.store?.products.map((entry) => entry.id)).toEqual([
			soldOut.id,
		]);
		expect(productsBlock).toMatchObject({
			type: 'products',
			productIds: [soldOut.id],
		});
		expect(bundle.files.some((file) => file.path.includes('products/'))).toBe(false);
	});

	it('blocks incomplete Available products with field-specific guidance', async () => {
		const { doc, product: entry, assetId } = availableProductDoc();

		entry.name = ' ';
		await expect(buildBundle(doc)).rejects.toThrow(/Available: add a product name/i);
		entry.name = 'Blue Monotype';

		entry.imageAlt = ' ';
		await expect(buildBundle(doc)).rejects.toThrow(/add an image description/i);
		entry.imageAlt = 'A blue abstract monotype';

		doc.productImages[entry.id] = { filename: '', assetId: null };
		await expect(buildBundle(doc)).rejects.toThrow(/choose or upload a product image/i);
		doc.productImages[entry.id] = { filename: 'mockup.png', assetId };

		const completeOffer = entry.offers[0];
		entry.offers = [];
		await expect(buildBundle(doc)).rejects.toThrow(/add at least one purchase option/i);
		entry.offers = [completeOffer];

		completeOffer.label = ' ';
		await expect(buildBundle(doc)).rejects.toThrow(/give every purchase option a label/i);
		completeOffer.label = 'A3 print';

		completeOffer.amountMinor = 0;
		await expect(buildBundle(doc)).rejects.toThrow(/positive display price/i);
		completeOffer.amountMinor = 12_500;

		completeOffer.checkout.url = 'https://example.com/not-stripe';
		await expect(buildBundle(doc)).rejects.toThrow(/valid buy\.stripe\.com Payment Link/i);
	});

	it('accepts a test link while Draft but blocks it when Available', async () => {
		const { doc, product: entry } = availableProductDoc();
		entry.offers[0].checkout.url = TEST_LINK;
		entry.status = 'draft';

		await expect(buildBundle(doc)).resolves.toMatchObject({
			contentJson: { store: { products: [] } },
		});

		entry.status = 'available';
		await expect(buildBundle(doc)).rejects.toThrow(/replace the Stripe test Payment Link/i);
	});

	it('emits a dedicated product upload at a stable products path', async () => {
		const { doc } = availableProductDoc({
			id: 'dedicated-product',
		});

		const bundle = await buildBundle(doc);
		const productFile = bundle.files.find((file) =>
			file.path.startsWith('src/assets/products/'),
		);

		expect(productFile?.path).toMatch(/\/mockup\.png$/);
		expect(new TextDecoder().decode(productFile!.bytes)).toBe('product pixels');
		expect(bundle.contentJson.store?.products[0].image).toBe(
			productFile!.path.replace('src/assets/', ''),
		);
	});

	it('reuses an emitted gallery image without creating a duplicate product asset', async () => {
		const doc = blankDoc();
		const sharedAssetId = registerAsset(
			new Blob(['shared pixels'], { type: 'image/png' }),
			'original.png',
		);
		doc.galleries.art = [
			{
				id: 'artwork-1',
				filename: 'original.png',
				assetId: sharedAssetId,
				meta: {
					title: 'Blue Monotype',
					alt: 'A blue abstract monotype',
					description: '',
					link: '',
				},
			},
		];
		const entry = product({ id: 'shared-artwork-product' });
		doc.content.store = { currency: 'USD', products: [entry] };
		doc.productImages[entry.id] = {
			filename: 'original.png',
			assetId: sharedAssetId,
		};

		const bundle = await buildBundle(doc);
		const imageFiles = bundle.files.filter((file) =>
			file.path.endsWith('/01-original.png'),
		);

		expect(bundle.contentJson.store?.products[0].image).toBe('art/01-original.png');
		expect(imageFiles.map((file) => file.path)).toEqual([
			'src/assets/art/01-original.png',
		]);
		expect(bundle.files.some((file) => file.path.includes('/products/'))).toBe(
			false,
		);
	});

	it('keeps draft product images in portable editor backups', async () => {
		const doc = blankDoc();
		const draft = product({ id: 'draft-backup', status: 'draft' });
		doc.content.store = { currency: 'USD', products: [draft] };
		doc.productImages[draft.id] = {
			filename: 'draft-mockup.png',
			assetId: registerAsset(
				new Blob(['draft backup pixels'], { type: 'image/png' }),
				'draft-mockup.png',
			),
		};

		const tree = unzipSync(await buildEditorBackup(doc));
		const manifest = JSON.parse(strFromU8(tree['hangwork-backup.json'])) as {
			doc: EditorDoc;
			assets: Array<{ filename: string; path: string }>;
		};

		expect(manifest.doc.content.store?.products[0].status).toBe('draft');
		expect(manifest.assets).toEqual([
			expect.objectContaining({ filename: 'draft-mockup.png', path: 'assets/1' }),
		]);
		expect(strFromU8(tree['assets/1'])).toBe('draft backup pixels');
	});

	it('server-renders a Shop page with product images in hydration and asset inventories', async () => {
		const { doc, product: entry } = availableProductDoc({ id: 'static-product' });
		doc.content.pages.shop = {
			title: 'Shop — {name}',
			label: 'Shop',
			heading: 'Shop',
			blocks: [{ id: 'products', type: 'products', layout: 'grid' }],
		};
		doc.content.nav.push({ path: 'shop', label: 'Shop' });
		const bundle = await buildBundle(doc);
		const productPath = bundle.contentJson.store!.products[0].image!;

		expect(referencedAssetPaths(bundle.contentJson)).toContain(
			`src/assets/${productPath}`,
		);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* runtime asset */', { status: 200 })),
		);
		try {
			const site = await generateStaticSite(bundle, {
				siteUrl: 'https://artist.hangwork.art',
				editorBase: 'https://hangwork.art/',
			});
			const shop = new TextDecoder().decode(
				site.files.find((file) => file.path === 'shop/index.html')!.bytes,
			);

			expect(shop).toContain(entry.name);
			expect(shop).toContain('product-buy');
			expect(shop).toContain(LIVE_LINK);
			expect(shop).toContain(`/assets/${productPath}`);
			expect(shop).toContain('window.__HW__=');
			expect(site.assetPaths).toContain(`assets/${productPath}`);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reloads shared and dedicated product images from a published account site', async () => {
		const content = catalogContent([
			product({
				id: 'shared-product',
				image: 'art/01-shared.png',
			}),
			product({
				id: 'dedicated-product',
				image: 'products/646564696361746564/mockup.png',
			}),
		]);
		content.galleries.art.items['01-shared.png'] = {
			id: 'shared-artwork',
			title: 'Shared artwork',
			alt: 'Shared artwork',
		};
		const inventory = {
			'assets/art/01-shared.png': { hash: 'shared', size: 13 },
			'assets/products/646564696361746564/mockup.png': {
				hash: 'dedicated',
				size: 16,
			},
		};
		const responses = new Map<string, Uint8Array>([
			[
				'_hw/content.json',
				new TextEncoder().encode(JSON.stringify(content)),
			],
			[
				'_hw/files.json',
				new TextEncoder().encode(JSON.stringify(inventory)),
			],
			[
				'assets/art/01-shared.png',
				new TextEncoder().encode('shared pixels'),
			],
			[
				'assets/products/646564696361746564/mockup.png',
				new TextEncoder().encode('dedicated pixels'),
			],
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				const path = new URL(String(input)).pathname.replace(/^\/+/, '');
				const bytes = responses.get(path);
				return bytes
					? new Response(bytes as BodyInit, { status: 200 })
					: new Response(null, { status: 404 });
			}),
		);

		try {
			const doc = await loadPublishedSite({
				siteId: 'site-1',
				subdomain: 'artist',
				status: 'published',
				lastPublishedAt: null,
			});
			const sharedGalleryAsset = doc.galleries.art.find(
				(entry) => entry.id === 'shared-artwork',
			)?.assetId;

			expect(sharedGalleryAsset).toBeTruthy();
			expect(doc.productImages['shared-product']).toMatchObject({
				filename: '01-shared.png',
				assetId: sharedGalleryAsset,
			});
			expect(doc.productImages['dedicated-product'].filename).toBe('mockup.png');
			expect(doc.productImages['dedicated-product'].assetId).toBeTruthy();
			expect(doc.productImages['dedicated-product'].assetId).not.toBe(
				sharedGalleryAsset,
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reloads shared and dedicated product images from a GitHub site', async () => {
		const content = catalogContent([
			product({
				id: 'shared-product',
				image: 'art/01-shared.png',
			}),
			product({
				id: 'dedicated-product',
				image: 'products/646564696361746564/mockup.png',
			}),
		]);
		content.galleries.art.items['01-shared.png'] = {
			id: 'shared-artwork',
			title: 'Shared artwork',
			alt: 'Shared artwork',
		};
		const bytesBySha = new Map<string, Uint8Array>([
			[
				'content-sha',
				new TextEncoder().encode(JSON.stringify(content)),
			],
			['shared-sha', new TextEncoder().encode('shared pixels')],
			['dedicated-sha', new TextEncoder().encode('dedicated pixels')],
		]);
		const tree = [
			{ path: 'src/data/content.json', type: 'blob', sha: 'content-sha' },
			{
				path: 'src/assets/art/01-shared.png',
				type: 'blob',
				sha: 'shared-sha',
			},
			{
				path: 'src/assets/products/646564696361746564/mockup.png',
				type: 'blob',
				sha: 'dedicated-sha',
			},
		];
		const client = {
			request: vi.fn(async (path: string) => {
				if (path.endsWith('/git/ref/heads/main'))
					return {
						status: 200,
						data: { object: { sha: 'head-sha' } },
					};
				if (path.endsWith('/git/trees/head-sha?recursive=1'))
					return { status: 200, data: { tree } };
				const sha = path.match(/\/git\/blobs\/([^/?]+)$/)?.[1];
				const bytes = sha ? bytesBySha.get(sha) : undefined;
				if (bytes)
					return {
						status: 200,
						data: {
							content: Buffer.from(bytes).toString('base64'),
							encoding: 'base64',
						},
					};
				throw new Error(`Unexpected GitHub request: ${path}`);
			}),
		} as unknown as GitHubClient;

		const loaded = await loadDocFromRepo(client, {
			owner: 'artist',
			repo: 'portfolio',
			branch: 'main',
		});
		const sharedGalleryAsset = loaded.doc.galleries.art.find(
			(entry) => entry.id === 'shared-artwork',
		)?.assetId;

		expect(sharedGalleryAsset).toBeTruthy();
		expect(loaded.doc.productImages['shared-product']).toMatchObject({
			filename: '01-shared.png',
			assetId: sharedGalleryAsset,
		});
		expect(loaded.doc.productImages['dedicated-product'].filename).toBe(
			'mockup.png',
		);
		expect(loaded.doc.productImages['dedicated-product'].assetId).toBeTruthy();
		expect(loaded.doc.productImages['dedicated-product'].assetId).not.toBe(
			sharedGalleryAsset,
		);
		expect(loaded.managedPaths).toEqual(
			expect.arrayContaining([
				'src/assets/art/01-shared.png',
				'src/assets/products/646564696361746564/mockup.png',
			]),
		);
	});
});

describe('legacy Stripe embeds', () => {
	it('does not report legacy Stripe Payment Links as invalid videos', () => {
		const doc = blankDoc();
		doc.content.pages.home.blocks!.push(
			{
				id: 'legacy-buy',
				type: 'embed',
				url: 'https://buy.stripe.com/legacy123',
			},
			{
				id: 'legacy-book',
				type: 'embed',
				url: 'https://book.stripe.com/legacy123',
			},
			{
				id: 'legacy-donate',
				type: 'embed',
				url: 'https://donate.stripe.com/legacy123',
			},
		);

		expect(
			collectIssues(doc).some((issue) => /video link|YouTube|Vimeo/i.test(issue)),
		).toBe(false);
	});

	it.each(['buy.stripe.com', 'book.stripe.com', 'donate.stripe.com'])(
		'renders a pinned %s Payment Link as Buy rather than Watch video',
		(host) => {
			const content = structuredClone(blankContent);
			content.pages.home.blocks = [
				{ id: 'gallery', type: 'gallery' },
				{
					id: 'legacy-payment',
					type: 'embed',
					url: `https://${host}/legacy123`,
					layout: { x: 10, y: 20, w: 35, ar: 16 / 9 },
				},
			];

			const markup = renderToStaticMarkup(
				createElement(PortfolioPage, {
					page: 'home',
					content,
					galleries: { 'selected-works': [] },
					base: '',
				}),
			);

			expect(markup).toContain('canvas-embed-buy-button');
			expect(markup).toContain('Buy');
			expect(markup).not.toContain('Watch video');
		},
	);
});
