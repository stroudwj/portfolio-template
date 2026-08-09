import { z } from 'zod';
import { contentSchema, parseAndMigrateContent } from '../../lib/content-schema';
import { pageGalleryConfigs } from '../../lib/content';
import { pageSections } from '../../lib/pageSections';
import type { EditorDoc } from './types';

export const EDITOR_DOC_VERSION = 4 as const;

const passthrough = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);
const singleImageSchema = passthrough({
	filename: z.string(),
	assetId: z.string().nullable(),
	sampleAssetId: z.string().nullable().default(null),
});
const imageLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	ar: z.number().positive(),
	z: z.number().optional(),
	locked: z.boolean().optional(),
});
const imageMetaSchema = passthrough({
	title: z.string(),
	alt: z.string().default(''),
	decorative: z.literal(true).optional(),
	description: z.string(),
	link: z.string(),
	clickAction: z.enum(['lightbox', 'link']).optional(),
	w: z.number().optional(),
	h: z.number().optional(),
	layout: imageLayoutSchema.optional(),
	focusX: z.number().min(0).max(100).optional(),
	focusY: z.number().min(0).max(100).optional(),
	cropAspect: z.string().regex(/^\d+(?:\.\d+)?\s*[:/]\s*\d+(?:\.\d+)?$/).optional(),
	cropZoom: z.number().min(1).max(6).optional(),
	workbenchFolder: z.string().max(80).optional(),
	effects: passthrough({
		hover: z.enum(['lift', 'tilt', 'zoom', 'mono']).optional(),
		reveal: z.enum(['fade', 'rise', 'wipe']).optional(),
		hang: z.boolean().optional(),
		skew: z.number().min(-6).max(6).optional(),
		mount: z.enum(['tape', 'nail', 'hook', 'frame']).optional(),
		phone: z.boolean().optional(),
	}).optional(),
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
				sampleAssetId: z.string().nullable().default(null),
			}),
		),
	),
	workbenchFolders: z.array(z.string().trim().min(1).max(80)).default([]),
	profileImage: singleImageSchema,
	logoImage: singleImageSchema,
	footerImage: singleImageSchema.default({ filename: '', assetId: null, sampleAssetId: null }),
	signatureImage: singleImageSchema.default({ filename: '', assetId: null, sampleAssetId: null }),
	cursorImage: singleImageSchema.default({ filename: '', assetId: null, sampleAssetId: null }),
	pageThumbs: z.record(z.string(), singleImageSchema),
	productImages: z.record(z.string(), singleImageSchema),
	fonts: z.record(z.string(), singleImageSchema),
	resumeFile: singleImageSchema,
	ogImage: passthrough({ folder: z.string(), entryId: z.string() }).optional(),
}).superRefine((value, ctx) => {
	for (const [folder, entries] of Object.entries(value.galleries)) {
		entries.forEach((entry, index) => {
			if (entry.assetId && entry.sampleAssetId)
				ctx.addIssue({
					code: 'custom',
					path: ['galleries', folder, index],
					message: 'Uploaded assetId and sampleAssetId are mutually exclusive',
				});
		});
	}
	for (const [slotName, slot] of [
		['profileImage', value.profileImage],
		['logoImage', value.logoImage],
		['footerImage', value.footerImage],
		['signatureImage', value.signatureImage],
		['cursorImage', value.cursorImage],
		['resumeFile', value.resumeFile],
		...Object.entries(value.pageThumbs).map(([key, item]) => [`pageThumbs.${key}`, item] as const),
		...Object.entries(value.productImages).map(([key, item]) => [`productImages.${key}`, item] as const),
		...Object.entries(value.fonts).map(([key, item]) => [`fonts.${key}`, item] as const),
	] as const) {
		if (slot.assetId && slot.sampleAssetId)
			ctx.addIssue({
				code: 'custom',
				path: [slotName],
				message: 'Uploaded assetId and sampleAssetId are mutually exclusive',
			});
	}
	const productIds = new Set((value.content.store?.products ?? []).map((product) => product.id));
	for (const productId of productIds) {
		if (!(productId in value.productImages))
			ctx.addIssue({
				code: 'custom',
				path: ['productImages', productId],
				message: 'The image slot used by this product is missing',
			});
	}
	for (const productId of Object.keys(value.productImages)) {
		if (!productIds.has(productId))
			ctx.addIssue({
				code: 'custom',
				path: ['productImages', productId],
				message: 'Product image points to a product that does not exist',
			});
	}
	for (const [pageKey, page] of Object.entries(value.content.pages)) {
		for (const [galleryIndex, gallery] of pageGalleryConfigs(page).entries()) {
			if (!(gallery.folder in value.galleries))
				ctx.addIssue({ code: 'custom', path: ['galleries', gallery.folder], message: `The image list used by “${pageKey}” is missing` });
			if (gallery.mobile) {
				const allowed = new Set((value.galleries[gallery.folder] ?? []).map((entry) => `image:${entry.id}`));
				const hostBlock =
					galleryIndex === 0 && page.gallery?.folder === gallery.folder
						? page.blocks?.find((block) => block.type === 'gallery')
						: page.blocks?.find(
								(block) =>
									block.type === 'images' &&
									block.gallery.folder === gallery.folder,
							);
				const sectionBlockIds = new Set(
					pageSections(page).find((section) =>
						section.blockIds.includes(hostBlock?.id ?? ''),
					)?.blockIds ?? [],
				);
				if (gallery.layout !== 'grid') {
					for (const block of page.blocks ?? []) {
						if (!sectionBlockIds.has(block.id)) continue;
						if (block.type === 'text' && block.layout) allowed.add(`text:${block.id}`);
						if (block.type === 'embed' && block.layout) allowed.add(`video:${block.id}`);
					}
				}
				for (const itemKey of [...gallery.mobile.order, ...Object.keys(gallery.mobile.items ?? {})]) {
					if (!allowed.has(itemKey))
						ctx.addIssue({
							code: 'custom',
							path: ['content', 'pages', pageKey, 'mobile'],
							message: STALE_MOBILE_ARRANGEMENT,
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

const STALE_MOBILE_ARRANGEMENT = 'Phone image arrangement points to an item that no longer exists';

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
	next.docVersion = 1;

	const content = isObject(next.content) ? next.content : {};
	const site = isObject(content.site) ? content.site : {};
	const theme = isObject(content.theme) ? content.theme : {};
	const resume = isObject(content.resume) ? content.resume : {};

	if (!isObject(next.logoImage))
		next.logoImage = { filename: typeof site.logoImage === 'string' ? site.logoImage : '', assetId: null };
	if (!isObject(next.cursorImage)) {
		const creative = isObject(site.creative) ? site.creative : {};
		const cursorImage = typeof creative.cursorImage === 'string' ? creative.cursorImage : '';
		next.cursorImage = {
			filename: cursorImage.slice(cursorImage.lastIndexOf('/') + 1),
			assetId: null,
		};
	}
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

function filenameFromAssetPath(path: string): string {
	return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** Editor document v2 adds one standalone image slot per catalog product. The
 * slot is reference-only when loaded from published content; uploaded pixels
 * remain in the browser asset registry as usual. */
export function migrateEditorDocV1ToV2(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	if ('content' in next) next.content = parseAndMigrateContent(next.content);

	const productImages = isObject(next.productImages) ? next.productImages : {};
	const content = isObject(next.content) ? next.content : {};
	const store = isObject(content.store) ? content.store : {};
	if (Array.isArray(store.products)) {
		for (const product of store.products) {
			if (!isObject(product) || typeof product.id !== 'string' || !product.id) continue;
			if (!(product.id in productImages)) {
				const image = typeof product.image === 'string' ? product.image : '';
				productImages[product.id] = {
					filename: image ? filenameFromAssetPath(image) : '',
					assetId: null,
				};
			}
		}
	}
	next.productImages = productImages;
	next.docVersion = 2;
	return next;
}

/** Editor document v3 follows Content schema 4's /bio → /about rename for
 * editor-only page thumbnail slots. The page content itself is migrated by the
 * shared Content boundary. */
export function migrateEditorDocV2ToV3(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	if ('content' in next) next.content = parseAndMigrateContent(next.content);
	if (isObject(next.pageThumbs)) {
		const renamed: MutableObject = {};
		for (const [key, value] of Object.entries(next.pageThumbs)) {
			const nextKey = key === 'bio' ? 'about' : key.startsWith('bio/') ? `about/${key.slice(4)}` : key;
			renamed[nextKey] = value;
		}
		next.pageThumbs = renamed;
	}
	next.docVersion = 3;
	return next;
}

/** Editor document v4 makes product samples explicit instead of recognizing
 * placeholder file names. Existing uploads remain uploads; Content-authored
 * sample ids are lifted into the editor image slot. */
export function migrateEditorDocV3ToV4(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	if ('content' in next) next.content = parseAndMigrateContent(next.content);
	if (isObject(next.galleries)) {
		for (const entries of Object.values(next.galleries)) {
			if (!Array.isArray(entries)) continue;
			for (const entry of entries) {
				if (!isObject(entry)) continue;
				const meta = isObject(entry.meta) ? entry.meta : {};
				entry.sampleAssetId =
					typeof entry.sampleAssetId === 'string'
						? entry.sampleAssetId
						: typeof meta.sampleAssetId === 'string'
							? meta.sampleAssetId
							: null;
				delete meta.sampleAssetId;
			}
		}
	}
	for (const value of [
		next.profileImage,
		next.logoImage,
		next.cursorImage,
		next.resumeFile,
		...(isObject(next.pageThumbs) ? Object.values(next.pageThumbs) : []),
		...(isObject(next.productImages) ? Object.values(next.productImages) : []),
		...(isObject(next.fonts) ? Object.values(next.fonts) : []),
	]) {
		if (isObject(value) && !('sampleAssetId' in value)) value.sampleAssetId = null;
	}
	next.docVersion = 4;
	return next;
}

const docMigrations: Record<number, (raw: unknown) => unknown> = {
	0: migrateEditorDocV0ToV1,
	1: migrateEditorDocV1ToV2,
	2: migrateEditorDocV2ToV3,
	3: migrateEditorDocV3ToV4,
};

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
	// Folder names used to live only on photos. Lift them into the persistent
	// folder list so deleting the last photo does not also delete its folder.
	if (isObject(migrated) && isObject(migrated.galleries)) {
		const folders = new Set(
			Array.isArray(migrated.workbenchFolders)
				? migrated.workbenchFolders.filter((value): value is string => typeof value === 'string')
				: [],
		);
		for (const entries of Object.values(migrated.galleries)) {
			if (!Array.isArray(entries)) continue;
			for (const entry of entries) {
				if (!isObject(entry) || !isObject(entry.meta)) continue;
				const name = entry.meta.workbenchFolder;
				if (typeof name === 'string' && name.trim()) folders.add(name.trim().slice(0, 80));
			}
		}
		migrated.workbenchFolders = [...folders];
	}
	let parsed = editorDocSchema.safeParse(migrated);
	// A phone arrangement is a derived preference pinned to item ids. Template
	// swaps and deletions can orphan those pins (a pre-fix applyTemplate did
	// exactly that); drop the arrangement on the affected pages and retry
	// rather than making the entire draft impossible to open.
	if (!parsed.success) {
		const stalePages = new Set(
			parsed.error.issues
				.filter(
					(issue) =>
						issue.message === STALE_MOBILE_ARRANGEMENT &&
						issue.path[0] === 'content' &&
						issue.path[1] === 'pages',
				)
				.map((issue) => String(issue.path[2])),
		);
		if (stalePages.size && isObject(migrated) && isObject(migrated.content)) {
			const pages = (migrated.content as MutableObject).pages;
			if (isObject(pages)) {
				for (const pageKey of stalePages) {
					const page = pages[pageKey];
					if (!isObject(page)) continue;
					if (isObject(page.gallery)) delete page.gallery.mobile;
					if (Array.isArray(page.blocks))
						for (const block of page.blocks)
							if (isObject(block) && block.type === 'images' && isObject(block.gallery))
								delete block.gallery.mobile;
				}
				parsed = editorDocSchema.safeParse(migrated);
			}
		}
	}
	if (!parsed.success) {
		const detail = parsed.error.issues
			.slice(0, 3)
			.map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`)
			.join('; ');
		throw new EditorDocValidationError(detail);
	}
	return parsed.data as EditorDoc;
}
