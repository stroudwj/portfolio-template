import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
	CONTENT_SCHEMA_VERSION,
	ContentValidationError,
	UnsupportedContentVersionError,
	parseAndMigrateContent,
} from '../src/lib/content-schema';
import { parseAndMigrateEditorDoc, UnsupportedEditorDocVersionError } from '../src/editor/lib/doc-schema';
import { buildBundle } from '../src/editor/lib/exporter';
import { blankDoc } from '../src/editor/lib/content-init';
import { registerAsset } from '../src/editor/lib/assets';
import { buildEditorBackup, readEditorBackup } from '../src/editor/lib/backup';
import { collectIssues } from '../src/editor/lib/validation';
import { automaticPhoneOrder } from '../src/portfolio/mobileOrder';

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));
}

describe('content compatibility', () => {
	it('keeps the editor and published canvas tie-break order identical', () => {
		expect(
			automaticPhoneOrder([
				{ key: 'video:v', y: 10, kind: 'video', index: 0 },
				{ key: 'text:t', y: 10, kind: 'text', index: 0 },
				{ key: 'image:i', y: 10, kind: 'image', index: 0 },
			]),
		).toEqual(['image:i', 'text:t', 'video:v']);
	});

	it('migrates unversioned content without mutating it or dropping extensions', () => {
		const raw = fixture('content-v0.json') as Record<string, unknown>;
		const original = structuredClone(raw);
		const content = parseAndMigrateContent(raw);

		expect(raw).toEqual(original);
		expect(content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
		expect(content.pages.home.blocks?.map((block) => block.type)).toEqual(['gallery', 'children']);
		expect(content.pages.bio.blocks).toEqual([{ id: 'about', type: 'about' }]);
		expect(content.pages.work.label).toBe('Work');
		expect(content.site.creative).toEqual({ grain: 5 });
		expect((content.site as unknown as Record<string, unknown>).extensionFlag).toBe('preserve-me');
		expect((content as unknown as Record<string, unknown>).customRoot).toEqual({ kept: true });
	});

	it('is idempotent and rejects content from a future editor', () => {
		const once = parseAndMigrateContent(fixture('content-v0.json'));
		expect(parseAndMigrateContent(once)).toEqual(once);
		expect(() => parseAndMigrateContent({ ...once, schemaVersion: CONTENT_SCHEMA_VERSION + 1 })).toThrow(
			UnsupportedContentVersionError,
		);
	});

	it('rejects unknown renderer block types instead of silently deleting them', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const invalid = structuredClone(content) as unknown as { pages: { home: { blocks: unknown[] } } };
		invalid.pages.home.blocks = [{ id: 'future', type: 'future-widget' }];
		expect(() => parseAndMigrateContent(invalid)).toThrow(ContentValidationError);
	});

	it('upgrades schema 1 artwork with stable ids for optional phone arrangements', () => {
		const current = parseAndMigrateContent(fixture('content-v0.json'));
		const legacy = structuredClone(current) as unknown as {
			schemaVersion: number;
			galleries: Record<string, { items: Record<string, { id?: string }> }>;
		};
		legacy.schemaVersion = 1;
		for (const gallery of Object.values(legacy.galleries))
			for (const meta of Object.values(gallery.items)) delete meta.id;

		const first = parseAndMigrateContent(legacy);
		const second = parseAndMigrateContent(legacy);
		const ids = Object.values(first.galleries).flatMap((gallery) =>
			Object.values(gallery.items).map((meta) => meta.id),
		);
		expect(ids.every(Boolean)).toBe(true);
		expect(second).toEqual(first);
	});

	it('normalizes hand-authored schema 2 files without dropping extension data', () => {
		const raw = structuredClone(parseAndMigrateContent(fixture('content-v0.json'))) as unknown as {
			schemaVersion: number;
			customRoot: { kept: boolean };
			pages: Record<string, { blocks?: unknown[]; pageExtension?: string }>;
			galleries: Record<string, { items: Record<string, Record<string, unknown>> }>;
		};
		delete raw.pages.home.blocks;
		raw.pages.home.pageExtension = 'keep-this-too';
		raw.galleries['selected-works'].items['One.jpg'] = {
			title: 'One',
			imageExtension: { cropNote: 'never delete' },
		};
		const original = structuredClone(raw);

		const content = parseAndMigrateContent(raw);

		expect(raw).toEqual(original);
		expect(content.pages.home.blocks?.map((block) => block.type)).toEqual(['gallery', 'children']);
		expect(content.galleries['selected-works'].items['One.jpg'].id).toBe(
			'image-selected-works-one-jpg-1',
		);
		expect((content.pages.home as unknown as Record<string, unknown>).pageExtension).toBe('keep-this-too');
		expect(
			(content.galleries['selected-works'].items['One.jpg'] as unknown as Record<string, unknown>)
				.imageExtension,
		).toEqual({ cropNote: 'never delete' });
		expect((content as unknown as Record<string, unknown>).customRoot).toEqual({ kept: true });
	});
});

describe('browser draft compatibility', () => {
	it('accepts a phone-only page heading position and rejects stale gallery item keys', () => {
		const doc = blankDoc();
		doc.content.pages.home.mobile = { mode: 'custom', order: ['page:heading', 'block:gallery'] };
		expect(() => parseAndMigrateEditorDoc(doc)).not.toThrow();
		doc.content.pages.home.gallery!.mobile = { mode: 'custom', order: ['image:missing'] };
		expect(() => parseAndMigrateEditorDoc(doc)).toThrow(/no longer exists/i);
	});

	it('lets a contact form use the artist email without requiring a technical form service', () => {
		const doc = blankDoc();
		doc.content.contact.email = 'artist@example.com';
		doc.content.pages.home.blocks!.push({
			id: 'contact',
			type: 'form',
			action: '',
			fields: [{ id: 'message', type: 'textarea', label: 'Message', required: true }],
		});

		expect(collectIssues(doc).some((issue) => issue.includes('contact form'))).toBe(false);
		doc.content.contact.email = '';
		expect(collectIssues(doc).some((issue) => issue.includes('contact email'))).toBe(true);
	});

	it('migrates a v0 draft, backfills registries, and round-trips through export', async () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
		const original = structuredClone(raw);
		const doc = parseAndMigrateEditorDoc(raw);

		expect(raw).toEqual(original);
		expect(doc.docVersion).toBe(2);
		expect(doc.content.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
		expect(doc.logoImage).toEqual({ filename: '', assetId: null });
		expect(doc.resumeFile.filename).toBe('resume.pdf');
		expect(doc.fonts['Draft Font']).toEqual({ filename: 'draft.woff2', assetId: null });
		expect(doc.productImages).toEqual({});
		expect((doc as unknown as Record<string, unknown>).draftExtension).toBe('keep-this');

		const bundle = await buildBundle(doc);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('rejects future draft versions', () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
		expect(() => parseAndMigrateEditorDoc({ ...raw, docVersion: 3 })).toThrow(UnsupportedEditorDocVersionError);
	});

	it('clears a stale sharing-image choice instead of rejecting the whole draft', () => {
		const doc = blankDoc();
		doc.ogImage = { folder: 'art', entryId: 'deleted-artwork' };

		const upgraded = parseAndMigrateEditorDoc(doc);

		expect(upgraded.ogImage).toBeUndefined();
	});

	it('exports images, thumbnails, fonts, and a résumé with versioned content intact', async () => {
		const doc = blankDoc();
		const asset = (name: string, type: string) => registerAsset(new Blob([name], { type }), name);
		doc.profileImage = { filename: 'profile.jpg', assetId: asset('profile.jpg', 'image/jpeg') };
		doc.logoImage = { filename: 'logo.png', assetId: asset('logo.png', 'image/png') };
		doc.galleries.art = [
			{
				id: 'work-1',
				filename: 'work.png',
				assetId: asset('work.png', 'image/png'),
				meta: { title: 'Work', alt: 'A test artwork', description: '', link: '' },
			},
		];
		doc.pageThumbs.art = { filename: 'thumb.png', assetId: asset('thumb.png', 'image/png') };
		doc.content.theme.customFonts = [{ name: 'Test Font', file: 'fonts/font.woff2' }];
		doc.fonts['Test Font'] = { filename: 'font.woff2', assetId: asset('font.woff2', 'font/woff2') };
		doc.resumeFile = { filename: 'resume.pdf', assetId: asset('resume.pdf', 'application/pdf') };

		const bundle = await buildBundle(doc);
		expect(bundle.files.map((file) => file.path).sort()).toEqual([
			'public/resume.pdf',
			'src/assets/art/01-work.png',
			'src/assets/fonts/font.woff2',
			'src/assets/logo-logo.png',
			'src/assets/profile.jpg',
			'src/assets/thumbs/617274-thumb.png',
		]);
		expect(bundle.contentJson).toMatchObject({
			schemaVersion: CONTENT_SCHEMA_VERSION,
			profile: { image: 'profile.jpg' },
			resume: { url: 'resume.pdf' },
		});
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('leaves draft pages and their image folders out of a published bundle', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.pages.art).toBeUndefined();
		expect(bundle.contentJson.nav.some((item) => item.path === 'art')).toBe(false);
		expect(bundle.contentJson.galleries.art).toBeUndefined();
	});

	it('removes every descendant of a draft page but keeps a gallery shared by a published page', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		doc.content.pages.art.children = ['series'];
		doc.content.pages.art.blocks!.push({ id: 'children', type: 'children' });
		doc.content.pages.series = {
			title: 'Series',
			gallery: { folder: 'series', alt: 'Series artwork', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }, { id: 'children', type: 'children' }],
			children: ['detail'],
		};
		doc.content.pages.detail = {
			title: 'Detail',
			gallery: { folder: 'detail', alt: 'Artwork detail', order: 'asc' },
			blocks: [{ id: 'gallery', type: 'gallery' }],
		};
		doc.content.galleries.series = { items: {} };
		doc.content.galleries.detail = { items: {} };
		doc.galleries.series = [];
		doc.galleries.detail = [];
		// A live page may intentionally reuse the draft parent's image group.
		doc.content.pages.photography.gallery = { folder: 'art', alt: 'Shared artwork', order: 'asc' };

		const bundle = await buildBundle(doc);

		expect(bundle.contentJson.pages.art).toBeUndefined();
		expect(bundle.contentJson.pages.series).toBeUndefined();
		expect(bundle.contentJson.pages.detail).toBeUndefined();
		expect(bundle.contentJson.galleries.series).toBeUndefined();
		expect(bundle.contentJson.galleries.detail).toBeUndefined();
		expect(bundle.contentJson.galleries.art).toBeDefined();
	});

	it('keeps reference-only gallery names and their existing display order', async () => {
		const doc = blankDoc();
		doc.content.pages.art.gallery!.order = 'desc';
		doc.galleries.art = [
			{
				id: 'reference-z',
				filename: 'z-last.jpg',
				assetId: null,
				meta: { title: 'Z', alt: 'Z artwork', description: '', link: '' },
			},
			{
				id: 'reference-a',
				filename: 'a-first.jpg',
				assetId: null,
				meta: { title: 'A', alt: 'A artwork', description: '', link: '' },
			},
		];

		const bundle = await buildBundle(doc);

		expect(Object.keys(bundle.contentJson.galleries.art.items)).toEqual(['z-last.jpg', 'a-first.jpg']);
		expect(bundle.contentJson.pages.art.gallery?.order).toBe('desc');
		expect(bundle.files.some((file) => file.path.startsWith('src/assets/art/'))).toBe(false);
	});

	it('refuses to publish an uploaded-file reference whose pixels are missing', async () => {
		const doc = blankDoc();
		doc.profileImage = { filename: 'lost-profile.png', assetId: 'missing-regression-asset' };

		await expect(buildBundle(doc)).rejects.toThrow(/missing from this browser/i);
	});

	it('refuses a generated file whose path would also be an image-group folder', async () => {
		const doc = blankDoc();
		doc.profileImage = {
			filename: 'art',
			assetId: registerAsset(new Blob(['profile'], { type: 'image/png' }), 'art'),
		};
		doc.galleries.art = [
			{
				id: 'collision-work',
				filename: 'work.png',
				assetId: registerAsset(new Blob(['work'], { type: 'image/png' }), 'work.png'),
				meta: { title: 'Work', alt: 'Work', description: '', link: '' },
			},
		];

		await expect(buildBundle(doc)).rejects.toThrow(/path|folder|rename/i);
	});

	it('gives formerly colliding page keys distinct thumbnail paths', async () => {
		const doc = blankDoc();
		doc.content.pages['a-b'] = { title: 'Dash', blocks: [] };
		doc.content.pages['a/b'] = { title: 'Slash', blocks: [] };
		doc.pageThumbs['a-b'] = {
			filename: 'thumb.png',
			assetId: registerAsset(new Blob(['dash'], { type: 'image/png' }), 'thumb.png'),
		};
		doc.pageThumbs['a/b'] = {
			filename: 'thumb.png',
			assetId: registerAsset(new Blob(['slash'], { type: 'image/png' }), 'thumb.png'),
		};

		const paths = (await buildBundle(doc)).files
			.map((file) => file.path)
			.filter((path) => path.startsWith('src/assets/thumbs/'))
			.sort();

		expect(paths).toEqual([
			'src/assets/thumbs/612d62-thumb.png',
			'src/assets/thumbs/612f62-thumb.png',
		]);
	});

	it('round-trips artwork descriptions and opt-in phone arrangements', async () => {
		const doc = blankDoc();
		const folder = doc.content.pages.home.gallery!.folder;
		doc.galleries[folder] = [
			{
				id: 'artwork-one',
				filename: 'work.jpg',
				assetId: registerAsset(new Blob(['work'], { type: 'image/jpeg' }), 'work.jpg'),
				meta: { title: 'Work', alt: 'A red painting on a white wall', description: '', link: '' },
			},
		];
		doc.content.pages.home.gallery!.mobile = {
			mode: 'custom',
			order: ['image:artwork-one'],
			items: { 'image:artwork-one': { width: 75, align: 'right' } },
		};

		const bundle = await buildBundle(doc);
		const exported = bundle.contentJson.galleries[folder].items['01-work.jpg'];
		expect(exported).toMatchObject({ id: 'artwork-one', alt: 'A red painting on a white wall' });
		expect(bundle.contentJson.pages.home.gallery?.mobile).toEqual(doc.content.pages.home.gallery!.mobile);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('puts draft pages and every uploaded asset in an editable backup', async () => {
		const doc = blankDoc();
		doc.content.pages.art.draft = true;
		doc.galleries.art = [
			{
				id: 'draft-work',
				filename: 'draft-work.png',
				assetId: registerAsset(new Blob(['draft pixels'], { type: 'image/png' }), 'draft-work.png'),
				meta: { title: 'Draft', alt: 'Draft artwork', description: '', link: '' },
			},
		];

		const tree = unzipSync(await buildEditorBackup(doc));
		const manifest = JSON.parse(strFromU8(tree['hangwork-backup.json'])) as {
			format: string;
			doc: typeof doc;
			assets: Array<{ id: string; filename: string; path: string }>;
		};

		expect(manifest.format).toBe('hangwork-editor-backup');
		expect(manifest.doc.content.pages.art.draft).toBe(true);
		expect(manifest.assets).toHaveLength(1);
		expect(manifest.assets[0]).toMatchObject({
			id: doc.galleries.art[0].assetId,
			filename: 'draft-work.png',
			path: 'assets/1',
		});
		expect(strFromU8(tree['assets/1'])).toBe('draft pixels');
	});

	it('rejects backup archives with missing or unlisted asset payloads', async () => {
		const doc = blankDoc();
		doc.galleries.art = [
			{
				id: 'backup-work',
				filename: 'backup-work.png',
				assetId: registerAsset(new Blob(['pixels'], { type: 'image/png' }), 'backup-work.png'),
				meta: { title: 'Backup', alt: 'Backup artwork', description: '', link: '' },
			},
		];
		const archive = await buildEditorBackup(doc);

		const missingTree = unzipSync(archive);
		delete missingTree['assets/1'];
		const missing = new File([zipSync(missingTree) as BlobPart], 'missing.zip', {
			type: 'application/zip',
		});
		await expect(readEditorBackup(missing)).rejects.toThrow(/missing/i);

		const extraTree = unzipSync(archive);
		extraTree['assets/unlisted'] = new Uint8Array([1, 2, 3]);
		const extra = new File([zipSync(extraTree) as BlobPart], 'extra.zip', { type: 'application/zip' });
		await expect(readEditorBackup(extra)).rejects.toThrow(/not used|unlisted|unexpected/i);
	});
});
