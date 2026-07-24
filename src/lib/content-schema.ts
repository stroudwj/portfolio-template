import { z } from 'zod';
import type { Content } from './content';

export const CONTENT_SCHEMA_VERSION = 3 as const;

const passthrough = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

const imageLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	ar: z.number().positive(),
});

const textLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number().optional(),
});

const mobileItemStyleSchema = passthrough({
	width: z.number().min(35).max(100).optional(),
	align: z.enum(['left', 'center', 'right']).optional(),
	hidden: z.boolean().optional(),
});

const mobileCompositionSchema = passthrough({
	mode: z.literal('custom'),
	order: z.array(z.string()),
	items: z.record(z.string(), mobileItemStyleSchema).optional(),
	columns: z.union([z.literal(1), z.literal(2)]).optional(),
});

const sectionHeightValueSchema = z.number().min(0).max(10000);
const responsiveSectionHeightSchema = passthrough({
	desktop: sectionHeightValueSchema.optional(),
	phone: sectionHeightValueSchema.optional(),
});

const galleryFolderSchema = z
	.string()
	.min(1)
	.refine((value) => value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\'), {
		message: 'Use one folder name without slashes',
	});

const galleryFilenameSchema = z
	.string()
	.min(1)
	.refine((value) => value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\'), {
		message: 'Artwork file names cannot contain folders',
	});

const galleryConfigSchema = passthrough({
	folder: galleryFolderSchema,
	alt: z.string(),
	order: z.enum(['asc', 'desc']),
	layout: z.enum(['freeform', 'grid']).optional(),
	columns: z.number().int().min(1).max(6).optional(),
	aspect: z.string().optional(),
	mobile: mobileCompositionSchema.optional(),
});

const storeOfferSchema = passthrough({
	id: z.string().min(1),
	label: z.string(),
	amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
	checkout: passthrough({
		provider: z.literal('stripe_payment_link'),
		url: z.string(),
	}),
});

const storeImagePathSchema = z
	.string()
	.min(1)
	.refine(
		(value) =>
			!value.includes('\\') &&
			!value.includes(':') &&
			!/[?#\u0000-\u001f\u007f]/.test(value) &&
			!/%(?:2e|2f|5c)/i.test(value) &&
			value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
		{ message: 'Use a safe path relative to the site assets folder' },
	);

const storeProductSchema = passthrough({
	id: z.string().min(1),
	name: z.string(),
	description: z.string().optional(),
	image: storeImagePathSchema.optional(),
	imageAlt: z.string(),
	status: z.enum(['draft', 'available', 'sold_out']),
	offers: z.array(storeOfferSchema),
});

const supportedCurrencyCodes =
	typeof Intl.supportedValuesOf === 'function'
		? new Set(Intl.supportedValuesOf('currency'))
		: null;

const storeConfigSchema = passthrough({
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/, 'Use a three-letter uppercase currency code')
		.refine((value) => !supportedCurrencyCodes || supportedCurrencyCodes.has(value), 'Use an ISO 4217 currency code')
		.default('USD'),
	products: z.array(storeProductSchema),
});

const pageBlockSchema = z.discriminatedUnion('type', [
	passthrough({
		id: z.string(),
		type: z.literal('text'),
		text: z.string(),
		align: z.enum(['left', 'center', 'right']).optional(),
		style: z.enum(['body', 'heading', 'subheading', 'quote']).optional(),
		link: z.string().optional(),
		layout: textLayoutSchema.optional(),
	}),
	passthrough({ id: z.string(), type: z.literal('embed'), url: z.string(), layout: imageLayoutSchema.optional() }),
	passthrough({ id: z.string(), type: z.literal('gallery') }),
	passthrough({
		id: z.string(),
		type: z.literal('images'),
		gallery: galleryConfigSchema,
		name: z.string().optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('children'),
		style: z.enum(['cards', 'large', 'list', 'index']).optional(),
	}),
	passthrough({ id: z.string(), type: z.literal('about') }),
	passthrough({
		id: z.string(),
		type: z.literal('button'),
		label: z.string(),
		url: z.string(),
		align: z.enum(['left', 'center', 'right']).optional(),
		appearance: z.enum(['solid', 'outline']).optional(),
	}),
	passthrough({ id: z.string(), type: z.literal('divider') }),
	passthrough({
		id: z.string(),
		type: z.literal('products'),
		productIds: z.array(z.string()).optional(),
		layout: z.enum(['grid', 'featured']).optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('form'),
		heading: z.string().optional(),
		action: z.string(),
		successMessage: z.string().optional(),
		fields: z.array(
			passthrough({
				id: z.string(),
				type: z.enum(['name', 'email', 'text', 'textarea']),
				label: z.string(),
				required: z.boolean().optional(),
			}),
		),
	}),
]);

const imageMetaSchema = passthrough({
	id: z.string().min(1),
	title: z.string().optional(),
	alt: z.string().optional(),
	description: z.string().optional(),
	link: z.string().optional(),
	w: z.number().optional(),
	h: z.number().optional(),
	layout: imageLayoutSchema.optional(),
});

/** Runtime validation for the JSON boundary. Object schemas deliberately preserve
 * unknown keys so a round trip never deletes hand-authored extension data. */
export const contentSchema = passthrough({
	schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
	site: passthrough({
		name: z.string(),
		logo: z.string().optional(),
		logoImage: z.string().optional(),
		description: z.string(),
		favicon: z.string(),
		language: z.string().min(2).optional(),
		signature: passthrough({ strokes: z.array(z.array(z.array(z.number()))) }).optional(),
		footer: z.string().optional(),
		footerHeights: responsiveSectionHeightSchema.optional(),
		ogImage: z.string().optional(),
		creative: passthrough({
			cursor: z.string().optional(),
			trail: z.enum(['sparkles', 'hearts', 'bubbles']).optional(),
			grain: z.number().optional(),
			clickMark: z.enum(['nail', 'cross', 'star']).optional(),
			looseHang: z.boolean().optional(),
			slowReveal: z.boolean().optional(),
			artworkWobble: z.boolean().optional(),
			colorSpin: z.boolean().optional(),
		}).optional(),
	}),
	theme: passthrough({
		backgroundColor: z.string(),
		textColor: z.string(),
		mutedTextColor: z.string(),
		accentColor: z.string(),
		fontFamily: z.string(),
		headingFontFamily: z.string().optional(),
		contentGap: z.number().optional(),
		logoScale: z.number().optional(),
		subheadingScale: z.number().min(50).max(200).optional(),
		logoPosition: z.enum(['left', 'center', 'freeform']).optional(),
		logoX: z.number().min(0).max(100).optional(),
		logoY: z.number().min(0).max(400).optional(),
		navStyle: z.enum(['dock', 'topbar', 'centered', 'pill', 'minimal']).optional(),
		fullscreenMobileMenu: z.boolean().optional(),
		automaticTextContrast: z.boolean().optional(),
		stabilizeNavigation: z.boolean().optional(),
		customFonts: z.array(passthrough({ name: z.string(), file: z.string() })).optional(),
	}),
	nav: z.array(passthrough({ path: z.string(), label: z.string(), hidden: z.boolean().optional() })),
	profile: passthrough({ image: z.string(), bio: z.string() }),
	contact: passthrough({ email: z.string() }),
	social: z.array(passthrough({ label: z.string(), url: z.string() })),
	resume: passthrough({ label: z.string(), url: z.string() }),
	store: storeConfigSchema.optional(),
	pages: z.record(
		z.string(),
		passthrough({
			title: z.string(),
			label: z.string().optional(),
			description: z.string().optional(),
			draft: z.boolean().optional(),
			noindex: z.boolean().optional(),
			heading: z.string().optional(),
				gallery: galleryConfigSchema.optional(),
				blocks: z.array(pageBlockSchema),
				mobile: mobileCompositionSchema.optional(),
				children: z.array(z.string()).optional(),
			thumbnail: z.string().optional(),
			background: z.string().optional(),
			sectionColors: z.record(z.string(), z.string()).optional(),
			sectionHeights: z.record(z.string(), responsiveSectionHeightSchema).optional(),
		}),
	),
	galleries: z.record(galleryFolderSchema, passthrough({ items: z.record(galleryFilenameSchema, imageMetaSchema) })),
}).superRefine((value, ctx) => {
	if (!value.pages.home)
		ctx.addIssue({ code: 'custom', path: ['pages', 'home'], message: 'A home page is required' });
	const productIds = new Set<string>();
	(value.store?.products ?? []).forEach((product, productIndex) => {
		if (productIds.has(product.id))
			ctx.addIssue({
				code: 'custom',
				path: ['store', 'products', productIndex, 'id'],
				message: 'Product id must be unique',
			});
		productIds.add(product.id);
		const offerIds = new Set<string>();
		product.offers.forEach((offer, offerIndex) => {
			if (offerIds.has(offer.id))
				ctx.addIssue({
					code: 'custom',
					path: ['store', 'products', productIndex, 'offers', offerIndex, 'id'],
					message: 'Offer id must be unique within its product',
				});
			offerIds.add(offer.id);
		});
	});
	const navPaths = new Set<string>();
	value.nav.forEach((item, index) => {
		const key = item.path || 'home';
		if (navPaths.has(key)) ctx.addIssue({ code: 'custom', path: ['nav', index, 'path'], message: 'Page appears in the menu more than once' });
		navPaths.add(key);
		if (!value.pages[key]) ctx.addIssue({ code: 'custom', path: ['nav', index, 'path'], message: 'Menu points to a page that does not exist' });
	});
	const parentOf = new Map<string, string>();
	for (const [pageKey, page] of Object.entries(value.pages)) {
		const children = new Set<string>();
		(page.children ?? []).forEach((child, index) => {
			if (children.has(child)) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'children', index], message: 'Sub-page appears more than once' });
			children.add(child);
			if (child === pageKey || !value.pages[child]) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'children', index], message: 'Sub-page does not exist' });
			const existingParent = parentOf.get(child);
			if (existingParent && existingParent !== pageKey)
				ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'children', index], message: `Sub-page already belongs to “${existingParent}”` });
			else parentOf.set(child, pageKey);
		});
		const blockIds = new Set<string>();
		(page.blocks ?? []).forEach((block, index) => {
			if (blockIds.has(block.id)) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'blocks', index, 'id'], message: 'Block id must be unique on its page' });
			blockIds.add(block.id);
			if (block.type === 'form') {
				const fieldIds = new Set<string>();
				block.fields.forEach((field, fieldIndex) => {
					if (fieldIds.has(field.id)) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'blocks', index, 'fields', fieldIndex, 'id'], message: 'Form field id must be unique' });
					fieldIds.add(field.id);
				});
			}
			if (block.type === 'products' && block.productIds) {
				const selectedIds = new Set<string>();
				block.productIds.forEach((productId, productIndex) => {
					if (selectedIds.has(productId))
						ctx.addIssue({
							code: 'custom',
							path: ['pages', pageKey, 'blocks', index, 'productIds', productIndex],
							message: 'Product appears in this block more than once',
						});
					selectedIds.add(productId);
					if (!productIds.has(productId))
						ctx.addIssue({
							code: 'custom',
							path: ['pages', pageKey, 'blocks', index, 'productIds', productIndex],
							message: 'Products block points to a product that does not exist',
						});
				});
			}
		});
		if (page.mobile) {
			const allowed = new Set((page.blocks ?? []).map((block) => `block:${block.id}`));
			allowed.add('page:heading');
			if (new Set(page.mobile.order).size !== page.mobile.order.length)
				ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'mobile', 'order'], message: 'Phone page order contains the same section more than once' });
			for (const key of [...page.mobile.order, ...Object.keys(page.mobile.items ?? {})])
				if (!allowed.has(key)) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'mobile'], message: 'Phone page arrangement points to a section that does not exist' });
		}
		for (const [galleryIndex, gallery] of pageGalleryConfigsForValidation(page).entries()) {
			if (!value.galleries[gallery.folder]) ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'gallery', galleryIndex], message: `Gallery folder “${gallery.folder}” is missing` });
			if (gallery.mobile && new Set(gallery.mobile.order).size !== gallery.mobile.order.length)
				ctx.addIssue({ code: 'custom', path: ['pages', pageKey, 'gallery', galleryIndex, 'mobile', 'order'], message: 'Phone order contains the same item more than once' });
		}
	}
	const visited = new Set<string>();
	const visiting = new Set<string>();
	const visit = (key: string) => {
		if (visiting.has(key)) {
			ctx.addIssue({ code: 'custom', path: ['pages', key, 'children'], message: 'Sub-pages cannot form a cycle' });
			return;
		}
		if (visited.has(key)) return;
		visiting.add(key);
		for (const child of value.pages[key]?.children ?? []) if (value.pages[child]) visit(child);
		visiting.delete(key);
		visited.add(key);
	};
	for (const key of Object.keys(value.pages)) visit(key);
	for (const [folder, gallery] of Object.entries(value.galleries)) {
		const ids = new Set<string>();
		Object.entries(gallery.items).forEach(([filename, meta]) => {
			if (ids.has(meta.id)) ctx.addIssue({ code: 'custom', path: ['galleries', folder, 'items', filename, 'id'], message: 'Artwork id must be unique within its gallery' });
			ids.add(meta.id);
		});
	}
});

function pageGalleryConfigsForValidation(page: {
	gallery?: z.infer<typeof galleryConfigSchema>;
	blocks?: z.infer<typeof pageBlockSchema>[];
}): z.infer<typeof galleryConfigSchema>[] {
	const galleries = page.gallery ? [page.gallery] : [];
	for (const block of page.blocks ?? []) if (block.type === 'images') galleries.push(block.gallery);
	return galleries;
}

export type ContentValidationIssue = { path: string; message: string };

export class UnsupportedContentVersionError extends Error {
	constructor(
		public readonly foundVersion: number,
		public readonly supportedVersion = CONTENT_SCHEMA_VERSION,
	) {
		super(
			`This site uses content format ${foundVersion}, but this editor supports up to ${supportedVersion}. Refresh to get the latest editor before making changes.`,
		);
		this.name = 'UnsupportedContentVersionError';
	}
}

export class ContentValidationError extends Error {
	constructor(public readonly issues: ContentValidationIssue[]) {
		const detail = issues
			.slice(0, 3)
			.map((issue) => `${issue.path || 'document'}: ${issue.message}`)
			.join('; ');
		super(`The site's content is incomplete or invalid${detail ? ` (${detail})` : ''}. The original data was not changed.`);
		this.name = 'ContentValidationError';
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

/** Fill the renderer's ordered block list from the older page fields. Safe to
 * run for every version, including hand-authored current files. */
function ensurePageBlocks(raw: unknown): unknown {
	if (!isObject(raw)) return raw;
	const labelByPath = new Map<string, string>();
	if (Array.isArray(raw.nav)) {
		for (const item of raw.nav) {
			if (isObject(item) && typeof item.path === 'string' && typeof item.label === 'string')
				labelByPath.set(item.path || 'home', item.label);
		}
	}
	if (!isObject(raw.pages)) return raw;
	for (const [key, value] of Object.entries(raw.pages)) {
		if (!isObject(value)) continue;
		if (!Array.isArray(value.blocks)) {
			if (isObject(value.gallery)) value.blocks = [{ id: 'gallery', type: 'gallery' }];
			else if (key === 'bio') value.blocks = [{ id: 'about', type: 'about' }];
			else value.blocks = [];
		}
		if (
			Array.isArray(value.children) &&
			value.children.length > 0 &&
			!(value.blocks as unknown[]).some((block) => isObject(block) && block.type === 'children')
		) {
			(value.blocks as unknown[]).push({ id: 'children', type: 'children' });
		}
		if (typeof value.label !== 'string' || !value.label) value.label = labelByPath.get(key) ?? key;
	}
	return raw;
}

/** Legacy, unversioned Content -> schema 1. This includes the old pre-block page
 * migration and retired creative-field cleanup. It is defensive by design: the
 * final runtime schema produces the useful validation error for malformed input. */
export function migrateContentV0ToV1(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	next.schemaVersion = 1;

	const site = isObject(next.site) ? next.site : null;
	const creative = site && isObject(site.creative) ? site.creative : null;
	if (creative) {
		delete creative.quietMode;
		delete creative.wallNote;
		if (Object.keys(creative).length === 0) delete site!.creative;
	}

	return ensurePageBlocks(next);
}

function stableImageId(folder: string, filename: string, index: number): string {
	const safe = `${folder}-${filename}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return `image-${safe || 'work'}-${index + 1}`;
}

function ensureStableImageIds(raw: unknown): unknown {
	if (!isObject(raw) || !isObject(raw.galleries)) return raw;
	for (const [folder, gallery] of Object.entries(raw.galleries)) {
		if (!isObject(gallery) || !isObject(gallery.items)) continue;
		Object.entries(gallery.items).forEach(([filename, meta], index) => {
			if (isObject(meta) && (typeof meta.id !== 'string' || !meta.id))
				meta.id = stableImageId(folder, filename, index);
		});
	}
	return raw;
}

/** Schema 2 adds stable artwork ids for opt-in phone arrangements and introduces
 * new block types. Existing sites keep their exact appearance and receive ids
 * silently during load. */
export function migrateContentV1ToV2(raw: unknown): unknown {
	// Some early schema-1 files were hand-authored before block normalization was
	// consistently written. Re-run the idempotent legacy normalizer here so they
	// cannot become blank pages merely because they already carried version 1.
	const next = migrateContentV0ToV1(raw);
	if (!isObject(next)) return next;
	ensureStableImageIds(next);
	next.schemaVersion = 2;
	return next;
}

/** Schema 3 adds an optional store catalog and products page blocks. Existing
 * sites omit the store entirely, so migration changes no rendered behavior. */
export function migrateContentV2ToV3(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	next.schemaVersion = 3;
	return next;
}

const contentMigrations: Record<number, (raw: unknown) => unknown> = {
	0: migrateContentV0ToV1,
	1: migrateContentV1ToV2,
	2: migrateContentV2ToV3,
};

function readVersion(raw: unknown): number {
	if (!isObject(raw) || raw.schemaVersion === undefined) return 0;
	if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 0) {
		throw new ContentValidationError([{ path: 'schemaVersion', message: 'Expected a non-negative integer' }]);
	}
	return raw.schemaVersion;
}

/** The only supported Content JSON boundary: clone, migrate sequentially, then
 * validate the latest shape. Callers may safely pass parsed JSON as `unknown`. */
export function parseAndMigrateContent(raw: unknown): Content {
	let version = readVersion(raw);
	if (version > CONTENT_SCHEMA_VERSION) throw new UnsupportedContentVersionError(version);

	let migrated = cloneUnknown(raw);
	while (version < CONTENT_SCHEMA_VERSION) {
		const migrate = contentMigrations[version];
		if (!migrate) throw new UnsupportedContentVersionError(version);
		migrated = migrate(migrated);
		version += 1;
	}
	// A hand-authored current-version file may still omit ids. Normalize this
	// derived field and the renderer block list before validation so phone
	// arrangements always have stable keys and pages cannot silently render blank.
	migrated = ensureStableImageIds(migrated);
	migrated = ensurePageBlocks(migrated);

	const parsed = contentSchema.safeParse(migrated);
	if (!parsed.success) {
		throw new ContentValidationError(
			parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
		);
	}
	return parsed.data as Content;
}
