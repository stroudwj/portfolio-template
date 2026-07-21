import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));
}

describe('content compatibility', () => {
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
		expect(() => parseAndMigrateContent({ ...once, schemaVersion: 2 })).toThrow(UnsupportedContentVersionError);
	});

	it('rejects unknown renderer block types instead of silently deleting them', () => {
		const content = parseAndMigrateContent(fixture('content-v0.json'));
		const invalid = structuredClone(content) as unknown as { pages: { home: { blocks: unknown[] } } };
		invalid.pages.home.blocks = [{ id: 'future', type: 'future-widget' }];
		expect(() => parseAndMigrateContent(invalid)).toThrow(ContentValidationError);
	});
});

describe('browser draft compatibility', () => {
	it('migrates a v0 draft, backfills registries, and round-trips through export', async () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
		const original = structuredClone(raw);
		const doc = parseAndMigrateEditorDoc(raw);

		expect(raw).toEqual(original);
		expect(doc.docVersion).toBe(1);
		expect(doc.content.schemaVersion).toBe(1);
		expect(doc.logoImage).toEqual({ filename: '', assetId: null });
		expect(doc.resumeFile.filename).toBe('resume.pdf');
		expect(doc.fonts['Draft Font']).toEqual({ filename: 'draft.woff2', assetId: null });
		expect((doc as unknown as Record<string, unknown>).draftExtension).toBe('keep-this');

		const bundle = await buildBundle(doc);
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});

	it('rejects future draft versions', () => {
		const raw = fixture('editor-doc-v0.json') as Record<string, unknown>;
		expect(() => parseAndMigrateEditorDoc({ ...raw, docVersion: 2 })).toThrow(UnsupportedEditorDocVersionError);
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
				meta: { title: 'Work', description: '', link: '' },
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
			'src/assets/thumbs/art-thumb.png',
		]);
		expect(bundle.contentJson).toMatchObject({
			schemaVersion: 1,
			profile: { image: 'profile.jpg' },
			resume: { url: 'resume.pdf' },
		});
		expect(parseAndMigrateContent(bundle.contentJson)).toEqual(bundle.contentJson);
	});
});
