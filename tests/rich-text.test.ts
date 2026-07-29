import { describe, expect, it } from 'vitest';
import {
	legacyTextToRichText,
	normalizeRichText,
	richTextPlainText,
	richTextToEditorHtml,
} from '../src/lib/richText';

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
});
