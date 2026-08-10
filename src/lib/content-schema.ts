import { z } from 'zod';
import type { Content } from './content';
import { encodeContactEmail } from '../portfolio/contactEmail';

export const CONTENT_SCHEMA_VERSION = 5 as const;

const passthrough = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

const imageLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	ar: z.number().positive(),
	z: z.number().optional(),
	locked: z.boolean().optional(),
});

const textLayoutSchema = passthrough({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number().optional(),
	z: z.number().optional(),
});

const textFlowLayoutSchema = passthrough({
	x: z.number(),
	w: z.number(),
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
const sectionGapValueSchema = z.number().min(-400).max(10000);
const responsiveSectionHeightSchema = passthrough({
	desktop: sectionHeightValueSchema.optional(),
	phone: sectionHeightValueSchema.optional(),
	desktopVw: sectionHeightValueSchema.optional(),
	phoneVw: sectionHeightValueSchema.optional(),
	desktopGap: sectionGapValueSchema.optional(),
	phoneGap: sectionGapValueSchema.optional(),
});

const kineticTextSchema = passthrough({
	effect: z.enum(['words', 'letters', 'lines', 'marquee']),
	speed: z.number().min(50).max(200).optional(),
	phone: z.boolean().optional(),
});

const sectionMotionSchema = passthrough({
	effect: z.enum(['reveal', 'drift', 'pin', 'scrub', 'sequence', 'none']),
	intensity: z.number().min(1).max(100).optional(),
	phone: z.boolean().optional(),
});

const artworkEffectSchema = passthrough({
	hover: z.enum(['lift', 'tilt', 'zoom', 'mono', 'none', 'caption']).optional(),
	reveal: z.enum(['fade', 'rise', 'wipe']).optional(),
	hang: z.boolean().optional(),
	skew: z.number().min(-6).max(6).optional(),
	mount: z
		.enum([
			'tape',
			'nail',
			'hook',
			'frame',
			'mat',
			'frame-oak',
			'frame-walnut',
			'tack',
			'corners-nail',
			'corners-tape',
			'corners-tack',
			'photo-corners',
		])
		.optional(),
	phone: z.boolean().optional(),
});

const projectDetailsSchema = passthrough({
	template: z.enum(['artwork', 'collaboration', 'exhibition']),
	year: z.string().optional(),
	medium: z.string().optional(),
	dimensions: z.string().optional(),
	collaborators: z.string().optional(),
	exhibitionHistory: z.string().optional(),
});

const pageSectionSchema = passthrough({
	id: z.string().min(1),
	name: z.string().min(1),
	blockIds: z.array(z.string().min(1)),
	editorColor: z.string().optional(),
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
	smartGrid: z.boolean().optional(),
	galleryWall: z.boolean().optional(),
	gapX: z.number().min(0).max(8).optional(),
	gapY: z.number().min(0).max(8).optional(),
	carousel: z.boolean().optional(),
	carouselFit: z.enum(['fit', 'fill']).optional(),
	carouselFrame: imageLayoutSchema.optional(),
	carouselFreeResize: z.boolean().optional(),
	carouselCustomRatio: z.boolean().optional(),
	carouselMoveImage: z.boolean().optional(),
	carouselHost: z.string().min(1).optional(),
	carouselShowCount: z.boolean().optional(),
	carouselShowTitle: z.boolean().optional(),
	carouselRequireAlt: z.boolean().optional(),
	carouselArrowStyle: z.enum(['chevron', 'arrow', 'circle', 'tab']).optional(),
	carouselFrameStyle: z.enum(['none', 'line', 'shadow', 'mat']).optional(),
	carouselChromeColor: z.string().optional(),
	carouselArrowColor: z.string().optional(),
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

// Shared by the contact block's address and the form block's delivery inbox: an
// address split in two and hex-encoded, so neither field can hold a joined `@`
// string. See portfolio/contactEmail.ts.
const contactEmailPartsSchema = passthrough({
	user: z.string().default(''),
	domain: z.string().default(''),
});

const pageBlockSchema = z.discriminatedUnion('type', [
	passthrough({
		id: z.string(),
		type: z.literal('text'),
		text: z.string(),
		richText: z
			.array(
				passthrough({
					align: z.enum(['left', 'center', 'right']).optional(),
					runs: z.array(
						passthrough({
							text: z.string(),
							link: z.string().optional(),
							size: z.enum(['body', 'subheading', 'heading']).optional(),
							fontSize: z.number().min(6).max(144).optional(),
							bold: z.literal(true).optional(),
							italic: z.literal(true).optional(),
							underline: z.literal(true).optional(),
							strike: z.literal(true).optional(),
						}),
					),
				}),
			)
			.optional(),
		fontFamily: z.string().min(1).optional(),
		align: z.enum(['left', 'center', 'right']).optional(),
		style: z.enum(['body', 'heading', 'subheading', 'quote']).optional(),
		/** Optional card color behind the words (auto-contrast text applies). */
		background: z.string().optional(),
		link: z.string().optional(),
		kinetic: kineticTextSchema.optional(),
		flowLayout: textFlowLayoutSchema.optional(),
		layout: textLayoutSchema.optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('embed'),
		url: z.string(),
		kind: z.enum(['video', 'audio', 'map']).optional(),
		flowLayout: textFlowLayoutSchema.optional(),
		layout: imageLayoutSchema.optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('shots'),
		src: z.string(),
		assetId: z.string().min(1).nullable().optional(),
		filename: z.string().optional(),
		scrollLength: z.number().min(140).max(500).optional(),
		fadeIntoPage: z.boolean().optional(),
		fadeStart: z.number().min(0).max(95).optional(),
		fadeDuration: z.number().min(5).max(100).optional(),
		fit: z.enum(['cover', 'contain']).optional(),
		phone: z.boolean().optional(),
	}),
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
		canvasLayout: imageLayoutSchema.optional(),
		items: z.array(passthrough({
			id: z.string().min(1),
			page: z.string().min(1),
			label: z.string().optional(),
			layout: imageLayoutSchema.optional(),
		})).optional(),
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
	passthrough({
		id: z.string(),
		type: z.literal('divider'),
		style: z.enum(['line', 'double', 'dotted', 'ornament']).optional(),
		width: z.enum(['short', 'medium', 'full']).optional(),
		color: z.string().optional(),
		layout: imageLayoutSchema.optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('products'),
		productIds: z.array(z.string()).optional(),
		layout: z.enum(['grid', 'featured']).optional(),
		canvasLayout: imageLayoutSchema.optional(),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('project'),
		project: passthrough({
			template: z.enum(['artwork', 'collaboration', 'exhibition']),
			year: z.string().optional(),
			medium: z.string().optional(),
			dimensions: z.string().optional(),
			collaborators: z.string().optional(),
			exhibitionHistory: z.string().optional(),
		}),
		labels: z.record(z.string(), z.string()).optional(),
		order: z.array(z.enum(['year', 'medium', 'dimensions', 'collaborators', 'exhibitionHistory'])).optional(),
		fontFamily: z.string().optional(),
		fontSize: z.number().min(8).max(96).optional(),
		layout: imageLayoutSchema.optional(),
	}),
	// A plain "email me about commissions" block. Every field except the address is
	// optional and the address itself is stored split + encoded, so nothing here can
	// be read out of the published page's inlined content. See portfolio/contactEmail.ts.
	passthrough({
		id: z.string(),
		type: z.literal('contact'),
		heading: z.string().optional(),
		text: z.string().optional(),
		email: contactEmailPartsSchema,
		buttonLabel: z.string().default('Email me'),
	}),
	passthrough({
		id: z.string(),
		type: z.literal('form'),
		heading: z.string().optional(),
		action: z.string(),
		// Split + encoded like the contact block's address above — never a readable
		// email. See portfolio/contactEmail.ts. A legacy plain-string value is
		// converted to this shape by encodeFormRecipientEmails() before this schema
		// runs, so nothing here reaches parsed content as a joined address.
		recipientEmail: contactEmailPartsSchema.optional(),
		successMessage: z.string().optional(),
		layout: imageLayoutSchema.optional(),
		fields: z.array(
			passthrough({
				id: z.string(),
				type: z.enum(['name', 'email', 'text', 'textarea']),
				label: z.string(),
				required: z.boolean().optional(),
			}),
		),
	}),
	// Canvas shape primitives: hairline rules, arrows, and outline rectangles.
	// Deliberately three shapes and axis-aligned — not a drawing tool.
	passthrough({
		id: z.string(),
		type: z.literal('shape'),
		shape: z.enum(['line', 'arrow', 'rectangle']),
		color: z.string().optional(),
		strokeWidth: z.number().min(1).max(24).optional(),
		direction: z.enum(['right', 'left', 'up', 'down']).optional(),
		layout: imageLayoutSchema.optional(),
	}),
	// Full-width accordion rows: display-scale titles with +/− toggles over body
	// text. Renders as native <details> grouped one-open-at-a-time, so published
	// sites need no script and no-JS readers can still open every row.
	passthrough({
		id: z.string(),
		type: z.literal('accordion'),
		items: z.array(
			passthrough({
				id: z.string(),
				title: z.string(),
				text: z.string().optional(),
			}),
		),
		titleSize: z.number().min(8).max(200).optional(),
		fontFamily: z.string().optional(),
	}),
]);

const imageMetaSchema = passthrough({
	id: z.string().min(1),
	sampleAssetId: z.string().min(1).optional(),
	title: z.string().optional(),
	alt: z.string().optional(),
	decorative: z.literal(true).optional(),
	description: z.string().optional(),
	link: z.string().optional(),
	clickAction: z.enum(['lightbox', 'link']).optional(),
	w: z.number().optional(),
	h: z.number().optional(),
	layout: imageLayoutSchema.optional(),
	focusX: z.number().min(0).max(100).optional(),
	focusY: z.number().min(0).max(100).optional(),
	cropAspect: z.string().regex(/^\d+(?:\.\d+)?\s*[:/]\s*\d+(?:\.\d+)?$/).optional(),
	cropZoom: z.number().min(1).max(6).optional(),
	brightness: z.number().min(50).max(150).optional(),
	contrast: z.number().min(50).max(150).optional(),
	workbenchFolder: z.string().max(80).optional(),
	effects: artworkEffectSchema.optional(),
});

/** Theme tokens alone — also the payload of an editor theme preset. */
export const themeSchema = passthrough({
	backgroundColor: z.string(),
	textColor: z.string(),
	mutedTextColor: z.string(),
	accentColor: z.string(),
	fontFamily: z.string(),
	bodyTextColor: z.string().optional(),
	headingTextColor: z.string().optional(),
	subheadingTextColor: z.string().optional(),
	headingFontFamily: z.string().optional(),
	contentGap: z.number().optional(),
	logoScale: z.number().optional(),
	subheadingScale: z.number().min(50).max(200).optional(),
	pageHeadingScale: z.number().min(50).max(200).optional(),
	pageHeadingPosition: z.enum(['left', 'center', 'right', 'freeform']).optional(),
	pageHeadingX: z.number().min(5).max(95).optional(),
	pageHeadingY: z.number().min(-120).max(240).optional(),
	logoPosition: z.enum(['left', 'center', 'freeform']).optional(),
	logoX: z.number().min(0).max(100).optional(),
	logoY: z.number().min(0).max(400).optional(),
	navStyle: z.enum(['dock', 'topbar', 'centered', 'pill', 'minimal', 'three-zone']).optional(),
	navOffsetX: z.number().min(-64).max(64).optional(),
	navOffsetY: z.number().min(-64).max(64).optional(),
	fullscreenMobileMenu: z.boolean().optional(),
	automaticTextContrast: z.boolean().optional(),
	stabilizeNavigation: z.boolean().optional(),
	stabilizeLogo: z.boolean().optional(),
	backgroundTexture: z.enum(['corkboard', 'blackboard', 'wood', 'fence', 'concrete']).optional(),
	/** Texture strength (0–100, absent = 100) and hue shift in degrees (absent = 0);
	 * non-destructive, like crop & light. */
	textureOpacity: z.number().min(0).max(100).optional(),
	textureHue: z.number().min(-180).max(180).optional(),
	/** false removes the default underline on text links; an explicit Underline
	 * mark on a linked run still wins (per-link override). Absent = underlined. */
	linkUnderline: z.boolean().optional(),
	motion: passthrough({
		intensity: z.enum(['off', 'subtle', 'full']).optional(),
		reveal: z.boolean().optional(),
		hover: z.boolean().optional(),
		hoverCaptions: z.boolean().optional(),
		heroParallax: z.boolean().optional(),
		stagger: z.boolean().optional(),
		scene: sectionMotionSchema.optional(),
	}).optional(),
	customFonts: z.array(passthrough({ name: z.string(), file: z.string() })).optional(),
});

/** Runtime validation for the JSON boundary. Object schemas deliberately preserve
 * unknown keys so a round trip never deletes hand-authored extension data. */
export const contentSchema = passthrough({
	schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
	site: passthrough({
		name: z.string(),
		headerMode: z.enum(['name', 'text', 'image']).optional(),
		logo: z.string().optional(),
		logoImage: z.string().optional(),
		description: z.string(),
		favicon: z.string(),
		language: z.string().min(2).optional(),
		signature: passthrough({
			strokes: z.array(z.array(z.array(z.number()))),
			image: z.string().optional(),
			align: z.enum(['left', 'center', 'right']).optional(),
		}).optional(),
		footer: z.string().optional(),
		footerImage: z.string().optional(),
		footerImageLayout: imageLayoutSchema.optional(),
		footerHeights: responsiveSectionHeightSchema.optional(),
		footerName: z.string().optional(),
		footerNameSize: z.number().min(8).max(300).optional(),
		footerColumns: z
			.array(
				passthrough({
					heading: z.string().optional(),
					links: z.array(passthrough({ label: z.string(), url: z.string() })),
				}),
			)
			.optional(),
		ogImage: z.string().optional(),
		creative: passthrough({
			cursor: z.string().optional(),
			cursorImage: z.string().optional(),
			trail: z.enum(['sparkles', 'hearts', 'bubbles']).optional(),
			grain: z.number().optional(),
			clickMark: z.enum(['nail', 'cross', 'star']).optional(),
			looseHang: z.boolean().optional(),
			hangStrength: z.number().min(0.25).max(5).optional(),
			slowReveal: z.boolean().optional(),
			artworkWobble: z.boolean().optional(),
			colorSpin: z.boolean().optional(),
			film: passthrough({
				preset: z.enum(['fine-grain', 'dust', 'projector']),
				layer: z.literal('over').optional(),
				intensity: z.number().min(1).max(30).optional(),
				size: z.number().min(50).max(200).optional(),
				speed: z.number().min(25).max(200).optional(),
				flicker: z.boolean().optional(),
				weave: z.boolean().optional(),
			}).optional(),
			pageTransition: z.enum(['fade', 'slide', 'curtain', 'gallery']).optional(),
			phone: passthrough({
				film: z.boolean().optional(),
				pageTransition: z.boolean().optional(),
				trail: z.boolean().optional(),
				clickMark: z.boolean().optional(),
				looseHang: z.boolean().optional(),
				slowReveal: z.boolean().optional(),
				artworkWobble: z.boolean().optional(),
				colorSpin: z.boolean().optional(),
			}).optional(),
		}).optional(),
	}),
	theme: themeSchema,
	nav: z.array(passthrough({ path: z.string(), label: z.string(), hidden: z.boolean().optional() })),
	profile: passthrough({
		name: z.string().optional(),
		image: z.string(),
		bio: z.string(),
		bioRichText: z
			.array(
				passthrough({
					align: z.enum(['left', 'center', 'right']).optional(),
					runs: z.array(
						passthrough({
							text: z.string(),
							link: z.string().optional(),
							size: z.enum(['body', 'subheading', 'heading']).optional(),
							fontSize: z.number().min(6).max(144).optional(),
							bold: z.literal(true).optional(),
							italic: z.literal(true).optional(),
							underline: z.literal(true).optional(),
							strike: z.literal(true).optional(),
						}),
					),
				}),
			)
			.optional(),
		bioFontFamily: z.string().min(1).optional(),
		imageWidth: z.number().min(60).max(720).optional(),
		imageAspect: z.string().optional(),
		imageFocusX: z.number().min(0).max(100).optional(),
		imageFocusY: z.number().min(0).max(100).optional(),
		imageCropZoom: z.number().min(1).max(6).optional(),
		imageLayout: imageLayoutSchema.optional(),
		contentLayout: imageLayoutSchema.optional(),
	}),
	contact: passthrough({ email: z.string() }),
	social: z.array(passthrough({ label: z.string(), url: z.string() })),
	resume: passthrough({ label: z.string(), url: z.string() }),
	store: storeConfigSchema.optional(),
	sectionLibrary: z.array(
		passthrough({
			id: z.string().min(1),
			name: z.string().min(1),
			block: pageBlockSchema,
			motion: sectionMotionSchema.optional(),
			color: z.string().optional(),
			heights: responsiveSectionHeightSchema.optional(),
		}),
	).optional(),
	pages: z.record(
		z.string(),
		passthrough({
			title: z.string(),
			label: z.string().optional(),
			description: z.string().optional(),
			draft: z.boolean().optional(),
			noindex: z.boolean().optional(),
			heading: z.string().optional(),
			hanging: z.boolean().optional(),
			hangingStrength: z.number().min(0.25).max(5).optional(),
			gallery: galleryConfigSchema.optional(),
			blocks: z.array(pageBlockSchema),
			sections: z.array(pageSectionSchema).min(1),
			mobile: mobileCompositionSchema.optional(),
			children: z.array(z.string()).optional(),
			thumbnail: z.string().optional(),
			background: z.string().optional(),
			sectionColors: z.record(z.string(), z.string()).optional(),
			sectionHeights: z.record(z.string(), responsiveSectionHeightSchema).optional(),
			sectionMotion: z.record(z.string(), sectionMotionSchema).optional(),
			sectionBleed: z.record(z.string(), z.boolean()).optional(),
			/** Per-section top-edge blend into the previous section's color. */
			sectionFades: z.record(z.string(), z.enum(['fade', 'dither'])).optional(),
			motion: sectionMotionSchema.optional(),
			headingKinetic: kineticTextSchema.optional(),
			project: projectDetailsSchema.optional(),
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
		const sectionIds = new Set<string>();
		const assignedBlockIds = new Set<string>();
		page.sections.forEach((section, sectionIndex) => {
			if (sectionIds.has(section.id))
				ctx.addIssue({
					code: 'custom',
					path: ['pages', pageKey, 'sections', sectionIndex, 'id'],
					message: 'Section id must be unique on its page',
				});
			sectionIds.add(section.id);
			section.blockIds.forEach((blockId, blockIndex) => {
				if (!blockIds.has(blockId))
					ctx.addIssue({
						code: 'custom',
						path: ['pages', pageKey, 'sections', sectionIndex, 'blockIds', blockIndex],
						message: 'Section points to a block that does not exist',
					});
				if (assignedBlockIds.has(blockId))
					ctx.addIssue({
						code: 'custom',
						path: ['pages', pageKey, 'sections', sectionIndex, 'blockIds', blockIndex],
						message: 'A block can belong to only one section',
					});
				assignedBlockIds.add(blockId);
			});
		});
		for (const blockId of blockIds)
			if (!assignedBlockIds.has(blockId))
				ctx.addIssue({
					code: 'custom',
					path: ['pages', pageKey, 'sections'],
					message: 'Every block must belong to a section',
				});
		if (page.mobile) {
			const allowed = new Set(page.sections.map((section) => `section:${section.id}`));
			allowed.add('page:heading');
			allowed.add('page:project');
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
			else if (key === 'bio' || key === 'about') value.blocks = [{ id: 'about', type: 'about' }];
			else value.blocks = [];
		}
		if (
			Array.isArray(value.children) &&
			value.children.length > 0 &&
			!(value.blocks as unknown[]).some((block) => isObject(block) && block.type === 'children')
		) {
			(value.blocks as unknown[]).push({ id: 'children', type: 'children' });
		}
		if (
			isObject(value.project) &&
			!(value.blocks as unknown[]).some((block) => isObject(block) && block.type === 'project')
		) {
			(value.blocks as unknown[]).push({ id: 'project', type: 'project', project: value.project });
			delete value.project;
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

/** Contact forms previously borrowed the public About email at render time.
 * Copy that value into the form once so future edits keep the public address
 * and the private delivery address independent. Only an entirely absent field
 * counts as unset — encodeFormRecipientEmails() below leaves a string in place
 * for this step to encode, and an already-encoded object must survive untouched
 * on every later reparse or an artist's customized delivery address would keep
 * silently reverting to the public one. */
function ensureFormRecipientEmails(raw: unknown): unknown {
	if (!isObject(raw) || !isObject(raw.pages) || !isObject(raw.contact)) return raw;
	const email = typeof raw.contact.email === 'string' ? raw.contact.email : '';
	if (!email) return raw;
	for (const page of Object.values(raw.pages)) {
		if (!isObject(page) || !Array.isArray(page.blocks)) continue;
		for (const block of page.blocks) {
			if (isObject(block) && block.type === 'form' && block.recipientEmail === undefined)
				block.recipientEmail = email;
		}
	}
	return raw;
}

/** Schema 5 (and every version before it) stored the form block's delivery inbox
 * as a plain string, which the static-site inliner (staticgen/html.ts) ships
 * verbatim in window.__HW__ — harvestable by scrapers, exactly like the address
 * the contact block used to store before it moved to split + encoded halves.
 * Encode any plain string left here (freshly hand-authored, freshly copied above
 * from the site's public contact.email, or surviving from an old draft) the same
 * way. Not tied to a schema-version bump: existing drafts and hand-authored
 * content.json upgrade silently the next time they're loaded or published. An
 * already-encoded object (the normal case once a draft has been through this
 * once) is left untouched. */
function encodeFormRecipientEmails(raw: unknown): unknown {
	if (!isObject(raw) || !isObject(raw.pages)) return raw;
	for (const page of Object.values(raw.pages)) {
		if (!isObject(page) || !Array.isArray(page.blocks)) continue;
		for (const block of page.blocks) {
			if (isObject(block) && block.type === 'form' && typeof block.recipientEmail === 'string')
				block.recipientEmail = encodeContactEmail(block.recipientEmail);
		}
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

function renameAboutPath(value: string): string {
	if (value === 'bio') return 'about';
	if (value.startsWith('bio/')) return `about/${value.slice(4)}`;
	return value;
}

function rewriteAboutLink(value: unknown): unknown {
	if (typeof value !== 'string' || !value.startsWith('/bio')) return value;
	const suffix = value.slice(4);
	if (suffix && !suffix.startsWith('/') && !suffix.startsWith('?') && !suffix.startsWith('#')) return value;
	return `/about${suffix}`;
}

/** Schema 4 makes the header choice explicit and gives the built-in About page
 * the address artists expect. The route rewrite includes nested pages and
 * internal button/text links, while leaving external URLs untouched. */
export function migrateContentV3ToV4(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;

	const site = isObject(next.site) ? next.site : null;
	if (site && typeof site.headerMode !== 'string') {
		site.headerMode =
			typeof site.logoImage === 'string' && site.logoImage
				? 'image'
				: typeof site.logo === 'string' && site.logo
					? 'text'
					: 'name';
	}

	if (isObject(next.pages) && isObject(next.pages.bio) && !isObject(next.pages.about)) {
		const renamed: MutableObject = {};
		for (const [key, page] of Object.entries(next.pages)) renamed[renameAboutPath(key)] = page;
		next.pages = renamed;
	}

	if (Array.isArray(next.nav)) {
		for (const item of next.nav) {
			if (isObject(item) && typeof item.path === 'string') item.path = renameAboutPath(item.path);
		}
	}

	if (isObject(next.pages)) {
		for (const page of Object.values(next.pages)) {
			if (!isObject(page)) continue;
			if (Array.isArray(page.children))
				page.children = page.children.map((child) => typeof child === 'string' ? renameAboutPath(child) : child);
			if (!Array.isArray(page.blocks)) continue;
			for (const block of page.blocks) {
				if (!isObject(block)) continue;
				if (block.type === 'text') block.link = rewriteAboutLink(block.link);
				if (block.type === 'button') block.url = rewriteAboutLink(block.url);
			}
		}
	}

	next.schemaVersion = 4;
	return next;
}

function remapSectionRecord(
	value: unknown,
	sections: Array<{ id: string; blockIds: string[] }>,
): unknown {
	if (!isObject(value)) return value;
	const next: MutableObject = {};
	for (const [key, item] of Object.entries(value)) {
		if (key === 'page:heading' || key === 'page:project') {
			next[key] = item;
			continue;
		}
		const section = sections.find((candidate) =>
			candidate.blockIds.some((blockId) => key === `block:${blockId}`),
		);
		if (section && !(`section:${section.id}` in next))
			next[`section:${section.id}`] = item;
	}
	return Object.keys(next).length ? next : undefined;
}

/** Schema 5 introduces explicit section containers. The primary freeform
 * gallery keeps its already-pinned text/embeds; every other legacy page part
 * becomes a movable section so published sites retain their prior boundaries. */
export function migrateContentV4ToV5(raw: unknown): unknown {
	const next = cloneUnknown(raw);
	if (!isObject(next)) return next;
	if (isObject(next.pages)) {
		for (const page of Object.values(next.pages)) {
			if (!isObject(page) || !Array.isArray(page.blocks)) continue;
			const blocks = page.blocks.filter(isObject);
			let sections: Array<{ id: string; name: string; blockIds: string[] }>;
			if (Array.isArray(page.sections)) {
				sections = page.sections.filter(isObject).map((section, index) => ({
					id: typeof section.id === 'string' && section.id ? section.id : `section-${index + 1}`,
					name: typeof section.name === 'string' && section.name ? section.name : `Section ${index + 1}`,
					blockIds: Array.isArray(section.blockIds)
						? section.blockIds.filter((id): id is string => typeof id === 'string')
						: [],
					...(typeof section.editorColor === 'string'
						? { editorColor: section.editorColor }
						: {}),
				}));
				const assigned = new Set(sections.flatMap((section) => section.blockIds));
				const unassigned = blocks
					.map((block) => block.id)
					.filter((id): id is string => typeof id === 'string' && !assigned.has(id));
				const main = sections.find((section) => section.id === 'main') ?? sections[0];
				if (main) main.blockIds.push(...unassigned);
				else sections = [{ id: 'main', name: 'Main section', blockIds: unassigned }];
			} else {
				const primary = blocks.find(
					(block) =>
						block.type === 'gallery' &&
						isObject(page.gallery) &&
						page.gallery.layout !== 'grid',
				);
				const mainIds = new Set<string>();
				if (primary && typeof primary.id === 'string') {
					mainIds.add(primary.id);
					for (const block of blocks) {
						if (
							typeof block.id === 'string' &&
							(block.type === 'text' || block.type === 'embed') &&
							isObject(block.layout)
						)
							mainIds.add(block.id);
						if (
							typeof block.id === 'string' &&
							block.type === 'images' &&
							isObject(block.gallery) &&
							block.gallery.carousel === true &&
							block.gallery.carouselHost === primary.id
						)
							mainIds.add(block.id);
					}
				} else {
					const first = blocks.find((block) => typeof block.id === 'string');
					if (first && typeof first.id === 'string') mainIds.add(first.id);
				}
				sections = [{ id: 'main', name: 'Main section', blockIds: [...mainIds] }];
				for (const block of blocks) {
					if (typeof block.id !== 'string' || mainIds.has(block.id)) continue;
					sections.push({
						id: `section-${block.id}`,
						name: `Section ${sections.length + 1}`,
						blockIds: [block.id],
					});
				}
				page.sectionColors = remapSectionRecord(page.sectionColors, sections);
				page.sectionHeights = remapSectionRecord(page.sectionHeights, sections);
				page.sectionMotion = remapSectionRecord(page.sectionMotion, sections);
			}
			page.sections = sections;
			if (isObject(page.mobile) && Array.isArray(page.mobile.order)) {
				const blockSection = new Map<string, string>();
				for (const section of sections)
					for (const blockId of section.blockIds)
						blockSection.set(`block:${blockId}`, `section:${section.id}`);
				const remapKey = (key: unknown): unknown =>
					typeof key === 'string' ? blockSection.get(key) ?? key : key;
				page.mobile.order = [...new Set(page.mobile.order.map(remapKey))];
				if (isObject(page.mobile.items)) {
					const items: MutableObject = {};
					for (const [key, item] of Object.entries(page.mobile.items)) {
						const mapped = remapKey(key);
						if (typeof mapped === 'string' && !(mapped in items)) items[mapped] = item;
					}
					page.mobile.items = Object.keys(items).length ? items : undefined;
				}
			}
		}
	}
	next.schemaVersion = 5;
	return next;
}

const contentMigrations: Record<number, (raw: unknown) => unknown> = {
	0: migrateContentV0ToV1,
	1: migrateContentV1ToV2,
	2: migrateContentV2ToV3,
	3: migrateContentV3ToV4,
	4: migrateContentV4ToV5,
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
	migrated = migrateContentV4ToV5(migrated);
	migrated = ensureFormRecipientEmails(migrated);
	migrated = encodeFormRecipientEmails(migrated);

	const parsed = contentSchema.safeParse(migrated);
	if (!parsed.success) {
		throw new ContentValidationError(
			parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
		);
	}
	return parsed.data as Content;
}
