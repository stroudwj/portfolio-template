import { describe, expect, it } from 'vitest';
import {
	selectWorkbenchItem,
	selectWorkbenchRange,
	workbenchMarqueeBase,
} from '../src/editor/lib/workbench-selection';

describe('workbench selection modifiers', () => {
	it('starts a new selection on an ordinary click', () => {
		expect([...selectWorkbenchItem(new Set(['first']), 'second', {})]).toEqual([
			'second',
		]);
	});

	it('adds Shift-clicked items to the current selection', () => {
		expect(
			[...selectWorkbenchItem(new Set(['first']), 'second', { shiftKey: true })],
		).toEqual(['first', 'second']);
	});

	it('keeps toggle selection available with Command or Ctrl', () => {
		expect(
			[...selectWorkbenchItem(new Set(['first', 'second']), 'first', { metaKey: true })],
		).toEqual(['second']);
	});

	it('selects every visible item between the anchor and Shift-clicked target', () => {
		expect(
			[
				...selectWorkbenchRange(
					new Set(['outside']),
					['first', 'second', 'third', 'fourth'],
					'first',
					'fourth',
				),
			],
		).toEqual(['first', 'second', 'third', 'fourth']);
	});

	it('can add a Shift range to a Command-built selection', () => {
		expect(
			[
				...selectWorkbenchRange(
					new Set(['outside']),
					['first', 'second', 'third'],
					'first',
					'third',
					true,
				),
			],
		).toEqual(['outside', 'first', 'second', 'third']);
	});

	it('uses the current selection as the base for Shift-drag', () => {
		expect([...workbenchMarqueeBase(new Set(['first']), { shiftKey: true })]).toEqual([
			'first',
		]);
		expect([...workbenchMarqueeBase(new Set(['first']), {})]).toEqual([]);
	});
});
