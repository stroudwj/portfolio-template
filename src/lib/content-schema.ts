import { z } from 'zod';
import type { Content } from './content';

export const CONTENT_SCHEMA_VERSION = 1 as const;

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

const galleryConfigSchema = passthrough({
	folder: z.string(),
	alt: z.string(),
	order: z.enum(['asc', 'desc']),
	layout: z.enum(['freeform', 'grid']).optional(),
	columns: z.number().int().min(1).max(6).optional(),
	aspect: z.string().optional(),
});

const pageBlockSchema = z.discriminatedUnion('type', [
	passthrough({
		id: z.string(),
		type: z.literal('text'),
		text: z.string(),
		align: z.enum(['left', 'center', 'right']).optional(),
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
]);

const imageMetaSchema = passthrough({
	title: z.string().optional(),
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
		signature: passthrough({ strokes: z.array(z.array(z.array(z.number()))) }).optional(),
		footer: z.string().optional(),
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
		customFonts: z.array(passthrough({ name: z.string(), file: z.string() })).optional(),
	}),
	nav: z.array(passthrough({ path: z.string(), label: z.string() })),
	profile: passthrough({ image: z.string(), bio: z.string() }),
	contact: passthrough({ email: z.string() }),
	social: z.array(passthrough({ label: z.string(), url: z.string() })),
	resume: passthrough({ label: z.string(), url: z.string() }),
	pages: z.record(
		z.string(),
		passthrough({
			title: z.string(),
			label: z.string().optional(),
			description: z.string().optional(),
			heading: z.string().optional(),
			gallery: galleryConfigSchema.optional(),
			blocks: z.array(pageBlockSchema).optional(),
			children: z.array(z.string()).optional(),
			thumbnail: z.string().optional(),
		}),
	),
	galleries: z.record(z.string(), passthrough({ items: z.record(z.string(), imageMetaSchema) })),
});

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

/** Legacy, unversioned Content -> schema 1. This includes the old pre-block page
 * migration and retired creative-field cleanup. It is defensive by design: the
 * final runtime schema produces the useful validation error for malformed input. */
export function migrateContentV0ToV1(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	next.schemaVersion = CONTENT_SCHEMA_VERSION;

	const site = isObject(next.site) ? next.site : null;
	const creative = site && isObject(site.creative) ? site.creative : null;
	if (creative) {
		delete creative.quietMode;
		delete creative.wallNote;
		if (Object.keys(creative).length === 0) delete site!.creative;
	}

	const labelByPath = new Map<string, string>();
	if (Array.isArray(next.nav)) {
		for (const item of next.nav) {
			if (isObject(item) && typeof item.path === 'string' && typeof item.label === 'string')
				labelByPath.set(item.path || 'home', item.label);
		}
	}

	if (isObject(next.pages)) {
		for (const [key, value] of Object.entries(next.pages)) {
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
	}

	return next;
}

const contentMigrations: Record<number, (raw: unknown) => unknown> = {
	0: migrateContentV0ToV1,
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

	const parsed = contentSchema.safeParse(migrated);
	if (!parsed.success) {
		throw new ContentValidationError(
			parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
		);
	}
	return parsed.data as Content;
}
