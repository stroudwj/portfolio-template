import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankDoc } from '../src/editor/lib/content-init';
import {
	loadSavedVersions,
	saveNamedVersion,
	savedVersionToEvict,
} from '../src/editor/lib/persistence';

const DOC_KEY = 'portfolio-editor:doc';
const SAVED_VERSIONS_KEY = 'portfolio-editor:saved-versions';

function useLocalStorage(
	initial: Readonly<Record<string, string>> = {},
	failWriteKey?: string,
): Map<string, string> {
	const values = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (key === failWriteKey) throw new Error('storage blocked');
			values.set(key, value);
		},
		removeItem: (key: string) => values.delete(key),
	});
	return values;
}

describe('starter draft branching safety', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('creates an independent named version before the active document changes', async () => {
		useLocalStorage();
		const doc = blankDoc();
		doc.content.site.name = 'Original draft';

		await saveNamedVersion(doc, 'Before Painter');
		doc.content.site.name = 'New starter';

		const versions = loadSavedVersions();
		expect(versions).toHaveLength(1);
		expect(versions[0].name).toBe('Before Painter');
		expect(versions[0].doc.content.site.name).toBe('Original draft');
	});

	it('identifies and evicts only the oldest version at the eight-version limit', async () => {
		useLocalStorage();
		for (let index = 1; index <= 8; index += 1)
			await saveNamedVersion(blankDoc(), `Version ${index}`);

		const before = loadSavedVersions();
		expect(savedVersionToEvict(before)?.name).toBe('Version 1');

		await saveNamedVersion(blankDoc(), 'Version 9');
		expect(loadSavedVersions().map((version) => version.name)).toEqual([
			'Version 9',
			'Version 8',
			'Version 7',
			'Version 6',
			'Version 5',
			'Version 4',
			'Version 3',
			'Version 2',
		]);
	});

	it('refuses the branch when browser storage fails and preserves the active draft', async () => {
		const active = blankDoc();
		active.content.site.name = 'Keep this draft';
		const serialized = JSON.stringify(active);
		const values = useLocalStorage(
			{ [DOC_KEY]: serialized },
			SAVED_VERSIONS_KEY,
		);

		await expect(saveNamedVersion(active, 'Cannot save')).rejects.toThrow(
			/version could not be saved/i,
		);
		expect(values.get(DOC_KEY)).toBe(serialized);
		expect(values.has(SAVED_VERSIONS_KEY)).toBe(false);
	});
});
