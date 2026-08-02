import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	legacyTextToRichText,
	normalizeRichText,
	richTextPlainText,
	richTextToEditorHtml,
} from '../src/lib/richText';
import { TextContent } from '../src/portfolio/TextBlock';

describe('rich text model', () => {
	it('upgrades legacy text while preserving its size, alignment, and line breaks', () => {
		const rich = legacyTextToRichText('First\nSecond', 'heading', 'center');
		expect(rich).toEqual([
			{ align: 'center', runs: [{ text: 'First', size: 'heading' }] },
			{ align: 'center', runs: [{ text: 'Second', size: 'heading' }] },
		]);
		expect(richTextPlainText(rich)).toBe('First\nSecond');
	});

	it('merges identical adjacent runs and removes false/default flags', () => {
		expect(
			normalizeRichText([
				{
					align: 'left',
					runs: [
						{ text: 'Safe', bold: true },
						{ text: ' text', size: 'body', bold: true },
						{ text: '', italic: true },
					],
				},
			]),
		).toEqual([{ align: undefined, runs: [{ text: 'Safe text', size: undefined, bold: true }] }]);
	});

	it('escapes user text before producing editor markup', () => {
		const html = richTextToEditorHtml([
			{ runs: [{ text: '<img src=x onerror=alert(1)>', underline: true }] },
		]);
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).not.toContain('<img');
	});

	it('preserves exact point sizes independently from the Body/Small/Large presets', () => {
		const rich = normalizeRichText([
			{ runs: [{ text: 'Caption', fontSize: 9.5 }, { text: 'Title', size: 'heading', fontSize: 54 }] },
		]);
		expect(rich[0].runs).toEqual([
			{ text: 'Caption', fontSize: 9.5 },
			{ text: 'Title', size: 'heading', fontSize: 54 },
		]);
		const html = richTextToEditorHtml(rich);
		expect(html).toContain('data-text-pt="9.5" style="font-size:9.5pt"');
		expect(html).toContain('data-text-size="heading" data-text-pt="54"');
	});

	it('keeps links on selected words instead of merging them into surrounding text', () => {
		const rich = normalizeRichText([
			{
				runs: [
					{ text: 'Read ' },
					{ text: 'the essay', link: '/essay', underline: true },
					{ text: ' next.' },
				],
			},
		]);
		expect(rich[0].runs).toHaveLength(3);
		expect(richTextToEditorHtml(rich)).toContain(
			'<a href="/essay"><u>the essay</u></a>',
		);

		const markup = renderToStaticMarkup(
			createElement(TextContent, {
				text: richTextPlainText(rich),
				richText: rich,
			}),
		);
		expect(markup).toContain('<a href="/essay">');
		expect(markup).not.toContain('<a href="/essay">Read');

		const marquee = renderToStaticMarkup(
			createElement(TextContent, {
				text: richTextPlainText(rich),
				richText: rich,
				kinetic: { effect: 'marquee' },
			}),
		);
		expect(marquee).toContain('<a href="/essay">');
	});

	it('escapes link attributes and refuses unsafe selected-word links when rendered', () => {
		const html = richTextToEditorHtml([
			{ runs: [{ text: 'safe', link: 'https://example.com/?q="x"&ok=1' }] },
		]);
		expect(html).toContain('href="https://example.com/?q=&quot;x&quot;&amp;ok=1"');
		expect(
			richTextToEditorHtml([
				{ runs: [{ text: 'unsafe', link: 'javascript:alert(1)' }] },
			]),
		).not.toContain('href=');

		const markup = renderToStaticMarkup(
			createElement(TextContent, {
				text: 'do not run',
				richText: [{ runs: [{ text: 'do not run', link: 'javascript:alert(1)' }] }],
			}),
		);
		expect(markup).not.toContain('href=');
	});
});
