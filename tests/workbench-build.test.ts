// The one-time "OK — build my pages" event (BACKLOG spec 10): workbench series
// folders are matched to pages by name and their photos copied over, Selected
// works fills the home page, and nothing records the folder→page link — the
// derived "already has the artist's images" check is what makes a second run a
// no-op.
import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/editor/lib/content-init';
import { uid } from '../src/editor/lib/assets';
import { WORKBENCH_FOLDER } from '../src/editor/lib/image-transfer';
import { starterSampleFallbackIds } from '../src/editor/lib/templates';
import {
	buildWorkbenchPages,
	SELECTED_WORKS_FOLDER,
} from '../src/editor/store';
import type { EditorDoc, ImageEntry } from '../src/editor/lib/types';

function uploadedPhoto(workbenchFolder?: string): ImageEntry {
	return {
		id: uid('e'),
		filename: 'photo.jpg',
		meta: { title: '', alt: '', description: '', link: '', workbenchFolder },
		assetId: uid('asset'),
		sampleAssetId: null,
	};
}

function sampleEntry(sampleAssetId: string): ImageEntry {
	return {
		id: uid('e'),
		filename: 'sample.jpg',
		meta: { title: '', alt: '', description: '', link: '' },
		assetId: null,
		sampleAssetId,
	};
}

/** A doc as the intake leaves it: a series page (empty) plus its folders. */
function intakeDoc(series: string[] = ['Harbor paintings']): EditorDoc {
	const doc = blankDoc();
	for (const label of series) {
		const key = label.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
		doc.content.pages[key] = {
			title: `${label} — {name}`,
			label,
			gallery: { folder: key, alt: label, order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
			sections: [{ id: 'main', name: 'Main section', blockIds: ['gallery'] }],
		};
		doc.content.nav.push({ path: key, label });
		doc.galleries[key] = [];
	}
	doc.workbenchFolders = [SELECTED_WORKS_FOLDER, ...series];
	return doc;
}

describe('buildWorkbenchPages', () => {
	it('copies each folder onto its matching page and Selected works onto home', () => {
		const doc = intakeDoc(['Harbor paintings']);
		doc.galleries[WORKBENCH_FOLDER] = [
			uploadedPhoto(SELECTED_WORKS_FOLDER),
			uploadedPhoto('Harbor paintings'),
			uploadedPhoto('Harbor paintings'),
			uploadedPhoto(), // unfiled photos stay out of the build
		];

		const { doc: built, report } = buildWorkbenchPages(doc);

		// Blank home's image group is its images block ('selected-works').
		expect(built.galleries['selected-works']).toHaveLength(1);
		expect(built.galleries['harbor-paintings']).toHaveLength(2);
		expect(report.built).toEqual([
			expect.objectContaining({ folder: SELECTED_WORKS_FOLDER, pageKey: 'home', count: 1 }),
			expect.objectContaining({ folder: 'Harbor paintings', pageKey: 'harbor-paintings', count: 2 }),
		]);
		expect(report.skipped).toHaveLength(0);
		expect(report.sampled).toHaveLength(0);

		// A copy, not a move — and no stored routing back to the folder.
		expect(built.galleries[WORKBENCH_FOLDER]).toHaveLength(4);
		const copy = built.galleries['harbor-paintings'][0];
		const source = doc.galleries[WORKBENCH_FOLDER][1];
		expect(copy.assetId).toBe(source.assetId);
		expect(copy.id).not.toBe(source.id);
		expect(copy.meta.workbenchFolder).toBeUndefined();
	});

	it('creates a page for a folder no page matches, and an empty page for an empty folder', () => {
		const doc = intakeDoc([]);
		doc.workbenchFolders = [SELECTED_WORKS_FOLDER, 'Sketchbook', 'Later series'];
		doc.galleries[WORKBENCH_FOLDER] = [uploadedPhoto('Sketchbook')];

		const { doc: built, report } = buildWorkbenchPages(doc);

		expect(report.createdPages).toEqual(['sketchbook', 'later-series']);
		expect(built.content.pages.sketchbook.label).toBe('Sketchbook');
		expect(built.content.nav.some((item) => item.path === 'sketchbook')).toBe(true);
		expect(built.galleries[built.content.pages.sketchbook.gallery!.folder]).toHaveLength(1);
		// The empty folder's page exists with nothing hung on it.
		expect(built.galleries[built.content.pages['later-series'].gallery!.folder]).toHaveLength(0);
		expect(report.built).toHaveLength(1);
	});

	it('replaces starter samples with the artist’s photos, but never their own images', () => {
		const doc = intakeDoc([]);
		doc.galleries['selected-works'] = [sampleEntry('photography-nga-124992-v1')];
		doc.galleries[WORKBENCH_FOLDER] = [uploadedPhoto(SELECTED_WORKS_FOLDER)];

		const { doc: built, report } = buildWorkbenchPages(doc);

		expect(built.galleries['selected-works']).toHaveLength(1);
		expect(built.galleries['selected-works'][0].sampleAssetId).toBeNull();
		expect(report.built).toHaveLength(1);
	});

	it('is a no-op the second time: pages with the artist’s images are reported, not overwritten', () => {
		const doc = intakeDoc(['Harbor paintings']);
		doc.galleries[WORKBENCH_FOLDER] = [
			uploadedPhoto(SELECTED_WORKS_FOLDER),
			uploadedPhoto('Harbor paintings'),
		];

		const first = buildWorkbenchPages(doc);
		const second = buildWorkbenchPages(first.doc);

		expect(second.doc).toBe(first.doc);
		expect(second.report.built).toHaveLength(0);
		expect(second.report.createdPages).toHaveLength(0);
		expect(second.report.skipped).toEqual([
			expect.objectContaining({ folder: SELECTED_WORKS_FOLDER, pageKey: 'home' }),
			expect.objectContaining({ folder: 'Harbor paintings', pageKey: 'harbor-paintings' }),
		]);
	});

	it('dresses empty series pages with discipline samples when the workbench holds no photos', () => {
		const doc = intakeDoc(['Harbor paintings', 'Portraits']);

		const { doc: built, report } = buildWorkbenchPages(doc, 'clearing');

		expect(report.sampled).toHaveLength(2);
		for (const key of ['harbor-paintings', 'portraits']) {
			const entries = built.galleries[key];
			expect(entries.length).toBeGreaterThan(0);
			for (const entry of entries) {
				expect(entry.assetId).toBeNull();
				expect(entry.sampleAssetId).toMatch(/^photography-nga-/);
			}
		}
		// The head start never hangs placeholder art on the home page.
		expect(built.galleries['selected-works']).toHaveLength(0);
		expect(report.built).toHaveLength(0);
	});

	it('leaves a page alone once it holds anything, even in sample mode', () => {
		const doc = intakeDoc(['Harbor paintings']);
		doc.galleries['harbor-paintings'] = [sampleEntry('photography-nga-124992-v1')];

		const { doc: built, report } = buildWorkbenchPages(doc, 'clearing');

		expect(built).toBe(doc);
		expect(report.sampled).toHaveLength(0);
	});
});

describe('starterSampleFallbackIds', () => {
	it('returns the starter’s own cleared samples for a known discipline', () => {
		const ids = starterSampleFallbackIds('clearing');
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect(id).toMatch(/^photography-nga-/);
	});

	it('mixes disciplines for a blank start', () => {
		const ids = starterSampleFallbackIds(null);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids.map((id) => id.split('-')[0])).size).toBeGreaterThan(1);
	});
});
