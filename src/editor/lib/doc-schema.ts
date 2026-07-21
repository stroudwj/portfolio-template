import { z } from 'zod';
import { contentSchema, parseAndMigrateContent } from '../../lib/content-schema';
import { pageGalleryConfigs } from '../../lib/content';
import type { EditorDoc } from './types';

export const EDITOR_DOC_VERSION = 1 as const;

const passthrough = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);
const singleImageSchema = passthrough({ filename: z.string(), assetId: z.string().nullable() });
const imageLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	ar: z.number().positive(),
});
const imageMetaSchema = passthrough({
	title: z.string(),
	alt: z.string().default(''),
	description: z.string(),
	link: z.string(),
	w: z.number().optional(),
	h: z.number().optional(),
	layout: imageLayoutSchema.optional(),
});

export const editorDocSchema = passthrough({
	docVersion: z.literal(EDITOR_DOC_VERSION),
	content: contentSchema,
	galleries: z.record(
		z.string(),
		z.array(
			passthrough({
				id: z.string().min(1),
				filename: z.string(),
				meta: imageMetaSchema,
				assetId: z.string().nullable(),
			}),
		),
	),
	profileImage: singleImageSchema,
	logoImage: singleImageSchema,
	pageThumbs: z.record(z.string(), singleImageSchema),
	fonts: z.record(z.string(), singleImageSchema),
	resumeFile: singleImageSchema,
	ogImage: passthrough({ folder: z.string(), entryId: z.string() }).optional(),
}).superRefine((value, ctx) => {
	for (const [pageKey, page] of Object.entries(value.content.pages)) {
		for (const [galleryIndex, gallery] of pageGalleryConfigs(page).entries()) {
			if (!(gallery.folder in value.galleries))
				ctx.addIssue({ code: 'custom', path: ['galleries', gallery.folder], message: `The image list used by “${pageKey}” is missing` });
			if (gallery.mobile) {
				const allowed = new Set((value.galleries[gallery.folder] ?? []).map((entry) => `image:${entry.id}`));
				// Only the main freeform gallery owns text/video pinned to the page canvas.
				if (galleryIndex === 0 && page.gallery && page.gallery.layout !== 'grid') {
					for (const block of page.blocks ?? []) {
						if (block.type === 'text' && block.layout) allowed.add(`text:${block.id}`);
						if (block.type === 'embed' && block.layout) allowed.add(`video:${block.id}`);
					}
				}
				for (const itemKey of [...gallery.mobile.order, ...Object.keys(gallery.mobile.items ?? {})]) {
					if (!allowed.has(itemKey))
						ctx.addIssue({
							code: 'custom',
							path: ['content', 'pages', pageKey, 'mobile'],
							message: 'Phone image arrangement points to an item that no longer exists',
						});
				}
			}
		}
	}
	for (const [folder, entries] of Object.entries(value.galleries)) {
		const ids = new Set<string>();
		entries.forEach((entry, index) => {
			if (ids.has(entry.id))
				ctx.addIssue({ code: 'custom', path: ['galleries', folder, index, 'id'], message: 'Artwork ids must be unique within an image group' });
			ids.add(entry.id);
		});
	}
});

export class UnsupportedEditorDocVersionError extends Error {
	constructor(
		public readonly foundVersion: number,
		public readonly supportedVersion = EDITOR_DOC_VERSION,
	) {
		super(
			`This draft was saved by editor format ${foundVersion}, but this editor supports up to ${supportedVersion}. Refresh before continuing.`,
		);
		this.name = 'UnsupportedEditorDocVersionError';
	}
}

export class EditorDocValidationError extends Error {
	constructor(detail: string) {
		super(`This browser draft could not be upgraded safely${detail ? ` (${detail})` : ''}. Your original draft is still saved.`);
		this.name = 'EditorDocValidationError';
	}
}

type MutableObject = Record<string, unknown>;

function isObject(value: unknown): value is MutableObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneUnknown<T>(value: T): T {
	if (value === undefined) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

export function migrateEditorDocV0ToV1(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	if ('content' in next) next.content = parseAndMigrateContent(next.content);
	next.docVersion = EDITOR_DOC_VERSION;

	const content = isObject(next.content) ? next.content : {};
	const site = isObject(content.site) ? content.site : {};
	const theme = isObject(content.theme) ? content.theme : {};
	const resume = isObject(content.resume) ? content.resume : {};

	if (!isObject(next.logoImage))
		next.logoImage = { filename: typeof site.logoImage === 'string' ? site.logoImage : '', assetId: null };
	if (!isObject(next.pageThumbs)) next.pageThumbs = {};
	if (!isObject(next.fonts)) next.fonts = {};
	if (!isObject(next.resumeFile)) {
		const url = typeof resume.url === 'string' ? resume.url : '';
		next.resumeFile = { filename: url.slice(url.lastIndexOf('/') + 1), assetId: null };
	}

	// Old drafts predate the separate font asset registry. Backfill reference-only
	// slots so a later publish preserves the files already in the repository.
	if (Array.isArray(theme.customFonts) && isObject(next.fonts)) {
		for (const font of theme.customFonts) {
			if (!isObject(font) || typeof font.name !== 'string' || typeof font.file !== 'string') continue;
			if (!(font.name in next.fonts))
				next.fonts[font.name] = { filename: font.file.slice(font.file.lastIndexOf('/') + 1), assetId: null };
		}
	}
	return next;
}

const docMigrations: Record<number, (raw: unknown) => unknown> = { 0: migrateEditorDocV0ToV1 };

function readDocVersion(raw: unknown): number {
	if (!isObject(raw) || raw.docVersion === undefined) return 0;
	if (typeof raw.docVersion !== 'number' || !Number.isInteger(raw.docVersion) || raw.docVersion < 0)
		throw new EditorDocValidationError('docVersion must be a non-negative integer');
	return raw.docVersion;
}

export function parseAndMigrateEditorDoc(raw: unknown): EditorDoc {
	let version = readDocVersion(raw);
	if (version > EDITOR_DOC_VERSION) throw new UnsupportedEditorDocVersionError(version);

	let migrated = cloneUnknown(raw);
	while (version < EDITOR_DOC_VERSION) {
		const migrate = docMigrations[version];
		if (!migrate) throw new UnsupportedEditorDocVersionError(version);
		migrated = migrate(migrated);
		version += 1;
	}

	// Content has its own version lifecycle and must be normalized even when the
	// outer draft already has the current document version.
	if (isObject(migrated) && 'content' in migrated) migrated.content = parseAndMigrateContent(migrated.content);
	// A sharing-image selection is a derived preference, not irreplaceable work.
	// Older drafts may retain it after the artwork was deleted; clear it instead of
	// making the entire draft impossible to open.
	if (isObject(migrated) && isObject(migrated.ogImage) && isObject(migrated.galleries)) {
		const folder = typeof migrated.ogImage.folder === 'string' ? migrated.ogImage.folder : '';
		const entryId = typeof migrated.ogImage.entryId === 'string' ? migrated.ogImage.entryId : '';
		const entries = migrated.galleries[folder];
		if (!Array.isArray(entries) || !entries.some((entry) => isObject(entry) && entry.id === entryId))
			delete migrated.ogImage;
	}
	const parsed = editorDocSchema.safeParse(migrated);
	if (!parsed.success) {
		const detail = parsed.error.issues
			.slice(0, 3)
			.map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`)
			.join('; ');
		throw new EditorDocValidationError(detail);
	}
	return parsed.data as EditorDoc;
}
