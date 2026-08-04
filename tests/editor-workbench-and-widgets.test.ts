import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankContent, blankDoc } from '../src/editor/lib/content-init';
import {
	imageGroupTargets,
	WORKBENCH_FOLDER,
} from '../src/editor/lib/image-transfer';
import { parseAndMigrateContent } from '../src/lib/content-schema';
import { parseAndMigrateEditorDoc } from '../src/editor/lib/doc-schema';
import { collectionLayoutAtCanvasBottom } from '../src/editor/lib/canvas-placement';
import type { StoreProduct } from '../src/lib/content';
import PortfolioPage from '../src/portfolio/PortfolioPage';

describe('image workbench destinations', () => {
	it('names every page image group while keeping the private workbench out of the list', () => {
		const doc = blankDoc();
		doc.galleries[WORKBENCH_FOLDER] = [];
		doc.content.pages.home.blocks = [
			...(doc.content.pages.home.blocks ?? []),
			{
				id: 'process',
				type: 'images',
				name: 'Process photos',
				gallery: { folder: 'process', alt: 'Process', order: 'asc' },
			},
		];
		doc.content.galleries.process = { items: {} };
		doc.galleries.process = [];

		const targets = imageGroupTargets(doc);

		expect(targets).toContainEqual({
			folder: 'selected-works',
			label: 'Home — Selected Works',
		});
		expect(targets).toContainEqual({
			folder: 'process',
			label: 'Home — Process photos',
		});
		expect(targets.some((target) => target.folder === WORKBENCH_FOLDER)).toBe(false);
	});

	it('preserves private folder organization in browser drafts', () => {
		const doc = blankDoc();
		doc.galleries[WORKBENCH_FOLDER] = [{
			id: 'reusable-photo',
			filename: 'studio.jpg',
			assetId: null,
			sampleAssetId: null,
			meta: {
				title: 'Studio',
				alt: '',
				description: '',
				link: '',
				workbenchFolder: 'Installation',
			},
		}];

		expect(
			parseAndMigrateEditorDoc(doc).galleries[WORKBENCH_FOLDER][0].meta.workbenchFolder,
		).toBe('Installation');
	});

	it('preserves empty named workbench folders in browser drafts', () => {
		const doc = blankDoc();
		doc.workbenchFolders = ['Ideas'];

		expect(parseAndMigrateEditorDoc(doc).workbenchFolders).toEqual(['Ideas']);
	});

	it('lifts legacy photo folders into the persistent folder list', () => {
		const doc = blankDoc();
		doc.galleries[WORKBENCH_FOLDER] = [{
			id: 'legacy-photo',
			filename: 'legacy.jpg',
			assetId: null,
			sampleAssetId: null,
			meta: {
				title: '',
				alt: '',
				description: '',
				link: '',
				workbenchFolder: 'Archive',
			},
		}];

		expect(parseAndMigrateEditorDoc(doc).workbenchFolders).toEqual(['Archive']);
	});
});

describe('freeform collection blocks', () => {
	it('keeps earlier editor blocks above later freeform image blocks', () => {
		const content = structuredClone(blankContent);
		content.galleries.front = { items: {} };
		content.galleries.back = { items: {} };
		content.pages.home.blocks = [
			{
				id: 'front',
				type: 'images',
				gallery: { folder: 'front', alt: 'Front', order: 'asc', layout: 'grid' },
			},
			{
				id: 'back',
				type: 'images',
				gallery: { folder: 'back', alt: 'Back', order: 'asc', layout: 'freeform' },
			},
		];
		content.pages.home.sections = [{ id: 'main', name: 'Main', blockIds: ['front', 'back'] }];
		const markup = renderToStaticMarkup(
			createElement(PortfolioPage, {
				page: 'home',
				content,
				galleries: {
					front: [{ id: 'front-image', src: '/front.jpg', alt: 'Front' }],
					back: [{ id: 'back-image', src: '/back.jpg', alt: 'Back', layout: { x: 0, y: 0, w: 80, ar: 1 } }],
				},
				base: '',
			}),
		);

		expect(markup).toMatch(/data-preview-block="front" style="z-index:2"/);
		expect(markup).toContain('class="section-canvas-layer" style="z-index:1"');
	});

	it('places collection widgets below occupied artwork with a compact, scalable first frame', () => {
		expect(collectionLayoutAtCanvasBottom('children', 74)).toEqual({
			x: 21,
			y: 76,
			w: 58,
			ar: 1.5,
		});
		expect(collectionLayoutAtCanvasBottom('products', 74)).toEqual({
			x: 16,
			y: 76,
			w: 68,
			ar: 1.33,
		});
	});

	it('preserves and renders sub-page and product collections as canvas widgets', () => {
		const content = structuredClone(blankContent);
		const item: StoreProduct = {
			id: 'print',
			name: 'Studio print',
			imageAlt: 'Studio print',
			status: 'sold_out',
			offers: [],
		};
		content.store = { currency: 'USD', products: [item] };
		content.pages.home.children = ['art'];
		content.pages.home.blocks = [
			{ id: 'gallery', type: 'gallery' },
			{
				id: 'children',
				type: 'children',
				canvasLayout: { x: 4, y: 8, w: 44, ar: 4 / 3 },
			},
			{
				id: 'products',
				type: 'products',
				canvasLayout: { x: 52, y: 8, w: 44, ar: 4 / 3 },
			},
		];
		content.pages.home.sections = [
			{
				id: 'main',
				name: 'Main section',
				blockIds: ['gallery', 'children', 'products'],
			},
		];

		const parsed = parseAndMigrateContent(content);
		const markup = renderToStaticMarkup(
			createElement(PortfolioPage, {
				page: 'home',
				content: parsed,
				galleries: { 'selected-works': [] },
				base: '',
			}),
		);

		expect(parsed.pages.home.blocks?.find((block) => block.id === 'children')).toMatchObject({
			canvasLayout: { x: 4, y: 8, w: 44, ar: 4 / 3 },
		});
		expect(markup.match(/canvas-widget-item/g)).toHaveLength(2);
		expect(markup).toContain('Art');
		expect(markup).toContain('Studio print');
	});
});
