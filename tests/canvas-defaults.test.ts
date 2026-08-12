// Spec 43: what happens the moment you add something.
// A — a newly pinned block lands on TOP of a composed canvas, not under the art.
// B — buttons are born free-form (their creation default; stored docs untouched).
// C — button fill/words color, corner shape and outline mode are optional fields:
//     with none of them set the markup is byte-for-byte what it always was.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initDocFromContent } from '../src/editor/lib/content-init';
import { AVAILABLE_STARTERS } from '../src/editor/lib/templates';
import { topCanvasZ } from '../src/editor/store';
import { pageSections } from '../src/lib/pageSections';
import { parseAndMigrateContent } from '../src/lib/content-schema';
import { blankContent } from '../src/editor/lib/content-init';
import type { Content, PageBlock } from '../src/lib/content';
import { PortfolioButton } from '../src/portfolio/PageBlocks';
import PortfolioPage from '../src/portfolio/PortfolioPage';

const starter = (id: string) => {
	const found = AVAILABLE_STARTERS.find((candidate) => candidate.id === id);
	if (!found) throw new Error(`no starter ${id}`);
	return found;
};

function contentWithHomeBlocks(blocks: PageBlock[]): Content {
	const base = structuredClone(blankContent);
	return parseAndMigrateContent({
		...base,
		pages: {
			...base.pages,
			home: { ...base.pages.home, blocks: [...(base.pages.home.blocks ?? []), ...blocks] },
		},
	});
}

describe('spec 43A — new canvas pieces land on top', () => {
	// The composed starters from spec 33 hang art over the header; a new piece
	// must beat every z already in that section, explicit or implicit.
	for (const id of ['clearing', 'still-room', 'masthead']) {
		it(`beats every existing layer on ${id}'s home canvas`, () => {
			const doc = initDocFromContent(starter(id).content);
			const page = doc.content.pages.home;
			const section = pageSections(page)[0];
			const next = topCanvasZ(doc, page, section.id);

			const existing: number[] = [];
			for (const block of (page.blocks ?? []).filter((candidate) => section.blockIds.includes(candidate.id))) {
				if (block.type === 'gallery' || block.type === 'images') {
					const folder = block.type === 'gallery' ? page.gallery?.folder : block.gallery.folder;
					for (const entry of (folder && doc.galleries[folder]) || [])
						if (typeof entry.meta.layout?.z === 'number') existing.push(entry.meta.layout.z);
				}
				const layout =
					'layout' in block && block.layout && typeof block.layout === 'object'
						? (block.layout as { z?: number })
						: undefined;
				if (typeof layout?.z === 'number') existing.push(layout.z);
			}

			expect(existing.length).toBeGreaterThan(0);
			expect(next).toBeGreaterThan(Math.max(...existing));
		});
	}

	it('starts at 1 on an empty canvas and never returns a non-positive z', () => {
		const doc = initDocFromContent(structuredClone(blankContent));
		expect(topCanvasZ(doc, doc.content.pages.home)).toBeGreaterThanOrEqual(1);
	});
});

describe('spec 43C — button styling is purely additive', () => {
	it('renders exactly the legacy markup when no styling field is set', () => {
		expect(
			renderToStaticMarkup(
				createElement(PortfolioButton, { label: 'View project', url: 'https://example.com/' }),
			),
		).toBe(
			'<div class="portfolio-action align-left">' +
				'<a class="portfolio-button appearance-solid" href="https://example.com/">View project</a>' +
				'</div>',
		);
	});

	it('adds a shape class and color custom properties only when asked', () => {
		const html = renderToStaticMarkup(
			createElement(PortfolioButton, {
				label: 'Shop',
				url: 'https://example.com/',
				appearance: 'outline',
				shape: 'pill',
				fillColor: '#123456',
				textColor: '#ffffff',
			}),
		);
		expect(html).toContain('portfolio-button appearance-outline shape-pill');
		expect(html).toContain('--button-fill:#123456');
		expect(html).toContain('--button-edge:#123456');
		expect(html).toContain('--button-ink:#ffffff');
	});

	it('keeps the fields through a content parse round trip', () => {
		const content = contentWithHomeBlocks([
			{
				id: 'cta',
				type: 'button',
				label: 'Enquire',
				url: 'https://example.com/',
				fillColor: '#101010',
				textColor: '#fafafa',
				shape: 'square',
				appearance: 'outline',
				layout: { x: 35, y: 4, w: 30, ar: 5, z: 9 },
			},
		]);
		const parsed = parseAndMigrateContent(JSON.parse(JSON.stringify(content)));
		const block = (parsed.pages.home.blocks ?? []).find((candidate) => candidate.id === 'cta');
		expect(block).toMatchObject({
			fillColor: '#101010',
			textColor: '#fafafa',
			shape: 'square',
			appearance: 'outline',
			layout: { x: 35, y: 4, w: 30, ar: 5, z: 9 },
		});
	});
});

describe('spec 43B — a pinned button paints on the canvas, not in the flow', () => {
	const render = (block: PageBlock) =>
		renderToStaticMarkup(
			createElement(PortfolioPage, {
				content: contentWithHomeBlocks([block]),
				page: 'home',
				galleries: {},
				base: '',
			} as never),
		);

	it('drops the flow wrapper margins when pinned', () => {
		const html = render({
			id: 'cta',
			type: 'button',
			label: 'Enquire',
			url: 'https://example.com/',
			layout: { x: 35, y: 4, w: 30, ar: 5 },
		});
		expect(html).toContain('portfolio-action align-left pinned');
		expect(html).toContain('>Enquire<');
	});

	it('keeps the flow wrapper for a button with no layout', () => {
		const html = render({
			id: 'cta',
			type: 'button',
			label: 'Enquire',
			url: 'https://example.com/',
		});
		expect(html).toContain('portfolio-action align-left"');
		expect(html).not.toContain('pinned');
	});
});
