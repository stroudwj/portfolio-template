// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useRef, useState, type CSSProperties } from 'react';
import { useEditor } from '../store';
import {
	Field,
	TextInput,
	Section,
	previewTypeMotion,
	showEditorTab,
} from './ui/controls';
import { ColorSwatchPicker } from './ui/ColorSwatchPicker';
import ImageCollectionEditor from './ImageCollectionEditor';
import MobileArrangementEditor, { type MobileArrangementItem } from './MobileArrangementEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl, uid } from '../lib/assets';
import {
	embedKindForInput,
	embedKindLabel,
	embedSpec,
	type EmbedKind,
} from '../../portfolio/mediaEmbed';
import { stripePaymentLink } from '../../portfolio/paymentEmbed';
import { DEFAULT_CAROUSEL_FRAME, parseAspect, uniformColumns } from '../../portfolio/Gallery';
import {
	bottomOf,
	canvasHeight,
	clampTextFlowLayout,
	DEFAULT_AR,
	flowMissing,
	roundLayout,
	roundTextLayout,
	textBottom,
	uniformGridLayouts,
} from '../../portfolio/canvasLayout';
import { automaticPhoneOrder } from '../../portfolio/mobileOrder';
import {
	isUrl,
	isVideoFile,
	MAX_VIDEO_BYTES,
	MAX_VIDEO_MB,
} from '../lib/validation';
import { fontOptionsForTheme } from '../lib/font-options';
import type {
	ChildrenStyle,
	FormField,
	GalleryConfig,
	KineticTextEffect,
	PageBlock,
	ProjectTemplate,
	SectionMotionEffect,
	TextAlign,
} from '../../lib/content';
import AboutContentEditor from './AboutContentEditor';
import RichTextEditor from './RichTextEditor';
import { PortfolioDivider } from '../../portfolio/PageBlocks';
import { readEffectClipboard, writeEffectClipboard } from '../lib/effect-clipboard';
import { collectionLayoutAtCanvasBottom } from '../lib/canvas-placement';
import { Modal } from './ui/Modal';
import {
	NEW_SECTION_ID,
	pageSections,
	sectionEditorColor,
	sectionPartKey,
} from '../../lib/pageSections';

const CHILDREN_STYLES: Array<{ value: ChildrenStyle; label: string }> = [
	{ value: 'cards', label: 'Thumbnail cards' },
	{ value: 'large', label: 'Big covers' },
	{ value: 'list', label: 'List with thumbnails' },
	{ value: 'index', label: 'Text index (no images)' },
];

const FORM_FIELD_TYPES: Array<{ value: FormField['type']; label: string }> = [
	{ value: 'name', label: 'Name' },
	{ value: 'email', label: 'Email' },
	{ value: 'text', label: 'Short answer' },
	{ value: 'textarea', label: 'Long answer' },
];

const PAGE_ITEM_COLLAPSE_STORE = 'portfolio-editor-page-items-collapsed-v1';

function loadPageItemCollapse(): Record<string, boolean> {
	if (typeof localStorage === 'undefined') return {};
	try {
		return JSON.parse(
			localStorage.getItem(PAGE_ITEM_COLLAPSE_STORE) ?? '{}',
		) as Record<string, boolean>;
	} catch {
		return {};
	}
}

function storePageItemCollapse(key: string, collapsed: boolean) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			PAGE_ITEM_COLLAPSE_STORE,
			JSON.stringify({ ...loadPageItemCollapse(), [key]: collapsed }),
		);
	} catch {
		/* The disclosure still works for this session when storage is unavailable. */
	}
}

const KINETIC_TEXT_EFFECTS: Array<{ value: KineticTextEffect | ''; label: string }> = [
	{ value: '', label: 'Still' },
	{ value: 'words', label: 'Words rise' },
	{ value: 'letters', label: 'Letters rise' },
	{ value: 'lines', label: 'Lines rise' },
	{ value: 'marquee', label: 'Marquee' },
];

const SECTION_MOTION_EFFECTS: Array<{
	value: SectionMotionEffect | '';
	label: string;
}> = [
	{ value: '', label: 'Still' },
	{ value: 'reveal', label: 'Reveal' },
	{ value: 'drift', label: 'Drift' },
	{ value: 'pin', label: 'Pin' },
	{ value: 'scrub', label: 'Scroll scrub' },
	{ value: 'sequence', label: 'Sequence' },
];

const CROP_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: '', label: 'Original (no crop)' },
	{ value: '1:1', label: 'Square 1:1' },
	{ value: '4:3', label: 'Landscape 4:3' },
	{ value: '3:2', label: 'Landscape 3:2' },
	{ value: '16:9', label: 'Wide 16:9' },
	{ value: '3:4', label: 'Portrait 3:4' },
	{ value: '2:3', label: 'Portrait 2:3' },
];

const CAROUSEL_RATIOS = [
	{ value: '16:9', label: 'Wide 16:9', ar: 16 / 9 },
	{ value: '16:10', label: 'Landscape 16:10', ar: 16 / 10 },
	{ value: '3:2', label: 'Landscape 3:2', ar: 3 / 2 },
	{ value: '4:3', label: 'Landscape 4:3', ar: 4 / 3 },
	{ value: '1:1', label: 'Square 1:1', ar: 1 },
	{ value: '3:4', label: 'Portrait 3:4', ar: 3 / 4 },
	{ value: '2:3', label: 'Portrait 2:3', ar: 2 / 3 },
] as const;

const isPageOrWebLink = (value: string): boolean =>
	!value.trim() || isUrl(value) || value.startsWith('/') || value.startsWith('#');

const isShotsSource = (value: string): boolean => {
	const source = value.trim();
	return (
		!source ||
		isUrl(source) ||
		(!source.startsWith('//') &&
			!source.includes('\\') &&
			!/^[a-z][a-z\d+.-]*:/i.test(source) &&
			!source.split('/').some((part) => part === '..'))
	);
};

type GalleryPatch = Partial<
	Pick<
		GalleryConfig,
		| 'layout'
		| 'columns'
		| 'aspect'
		| 'carousel'
		| 'carouselFit'
		| 'carouselFrame'
		| 'carouselFreeResize'
		| 'carouselMoveImage'
		| 'carouselHost'
		| 'carouselShowCount'
		| 'carouselShowTitle'
		| 'carouselRequireAlt'
		| 'carouselArrowStyle'
		| 'carouselFrameStyle'
		| 'carouselChromeColor'
		| 'mobile'
	>
>;

/** Natural width/height ratio of an image URL (undefined when it can't load). */
const measureAr = (url: string | null | undefined): Promise<number | undefined> =>
	new Promise((resolve) => {
		if (!url) return resolve(undefined);
		const img = new Image();
		img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined);
		img.onerror = () => resolve(undefined);
		img.src = url;
	});

/** Layout toggle shared by the main gallery block and extra image groups. */
function LayoutToggle({
	mode,
	onPatch,
	label,
	carousel = false,
}: {
	mode: 'freeform' | 'grid' | 'carousel';
	onPatch: (patch: GalleryPatch) => void;
	label: string;
	carousel?: boolean;
}) {
	return (
		<div className="align-toggle" role="group" aria-label={`${label} layout`}>
			<button
				type="button"
				className={`btn-icon btn-chip ${mode === 'freeform' ? 'active' : ''}`}
				title="Freeform canvas — drag images anywhere in the preview"
				aria-label={`Use Freeform layout for ${label}`}
				aria-pressed={mode === 'freeform'}
				onClick={() => onPatch({ layout: undefined, carousel: undefined })}
			>
				Freeform
			</button>
			<button
				type="button"
				className={`btn-icon btn-chip ${mode === 'grid' ? 'active' : ''}`}
				title="Auto grid — images arrange themselves in neat rows"
				aria-label={`Use Grid layout for ${label}`}
				aria-pressed={mode === 'grid'}
				onClick={() => onPatch({ layout: 'grid', carousel: undefined })}
			>
				Grid
			</button>
			{carousel && (
				<button
					type="button"
					className={`btn-icon btn-chip ${mode === 'carousel' ? 'active' : ''}`}
					title="Click-through carousel — show one image at a time"
					aria-label={`Use Carousel layout for ${label}`}
					aria-pressed={mode === 'carousel'}
					onClick={() => onPatch({ layout: undefined, carousel: true })}
				>
					Carousel
				</button>
			)}
		</div>
	);
}

/** Grid-mode settings (columns + crop) shared by the gallery block and image groups. */
function GridOptions({
	config,
	onPatch,
	onAdopt,
	label,
}: {
	config: GalleryConfig;
	onPatch: (patch: GalleryPatch) => void;
	label: string;
	/** Copy this grid arrangement into freeform coordinates, then switch to Freeform. */
	onAdopt?: () => void;
}) {
	return (
		<div className="grid-options">
			<label className="grid-option">
				Columns
				<select
					className="select-input"
					aria-label={`Number of columns for ${label}`}
					value={uniformColumns(config.columns)}
					onChange={(e) => onPatch({ columns: Number(e.target.value) })}
				>
					{[1, 2, 3, 4, 5, 6].map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</select>
			</label>
			<label className="grid-option">
				Crop
				<select
					className="select-input"
					aria-label={`Image crop for ${label}`}
					value={config.aspect ?? ''}
					onChange={(e) => onPatch({ aspect: e.target.value || undefined })}
				>
					{CROP_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</label>
			{onAdopt && (
				<button
					type="button"
					className="btn-link adopt-grid"
					title="Switch to Freeform with the images placed exactly like this grid — then slide them around from there."
					onClick={onAdopt}
				>
					Edit this arrangement in Freeform
				</button>
			)}
		</div>
	);
}

export default function PageEditor({
	pageKey,
	nested = false,
	includeChildren = true,
}: {
	pageKey: string;
	nested?: boolean;
	/** The selected-page workspace opens sub-pages independently instead of
	 * rendering every child editor beneath its parent. */
	includeChildren?: boolean;
}) {
	const editor = useEditor();
	const addMenuRef = useRef<HTMLDetailsElement>(null);
	const floatingAddMenuRef = useRef<HTMLDetailsElement>(null);
	const pageContentRef = useRef<HTMLDivElement>(null);
	const [pendingSectionAdd, setPendingSectionAdd] = useState<{
		label: string;
		action: (sectionId: string) => void;
	} | null>(null);
	const [pendingSectionMove, setPendingSectionMove] = useState<{
		blockId: string;
		label: string;
		sourceSectionId: string;
	} | null>(null);
	const [collapsedEditorItems, setCollapsedEditorItems] = useState<
		Record<string, boolean>
	>(loadPageItemCollapse);
	const collapseItemKey = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) => `${pageKey}:${kind}:${id}`;
	const itemIsCollapsed = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) => collapsedEditorItems[collapseItemKey(kind, id)] === true;
	const toggleEditorItem = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) => {
		const key = collapseItemKey(kind, id);
		setCollapsedEditorItems((current) => {
			const collapsed = current[key] !== true;
			storePageItemCollapse(key, collapsed);
			return { ...current, [key]: collapsed };
		});
	};
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const pageName = page.label || (isHome ? 'Home' : pageKey);
	const blocks = page.blocks ?? [];
	const sections = pageSections(page);
	const blockById = new Map(blocks.map((block) => [block.id, block]));
	const sectionForBlock = (blockId: string) =>
		sections.find((section) => section.blockIds.includes(blockId));
	const hasAboutBlock = blocks.some((block) => block.type === 'about');
	// Offer the site's own palette first in every color-blocking picker.
	const themeColors = [
		doc.content.theme.backgroundColor,
		doc.content.theme.textColor,
		doc.content.theme.accentColor,
	].filter(Boolean);
	const textFontOptions = fontOptionsForTheme(doc.content.theme);
	const galleryMode = page.gallery?.layout === 'grid' ? 'grid' : 'freeform';
	const sectionHasFreeCanvas = (sectionId: string): boolean => {
		const section = sections.find((candidate) => candidate.id === sectionId);
		return !!section?.blockIds.some((id) => {
			const block = blockById.get(id);
			return (
				(block?.type === 'gallery' && !!page.gallery && galleryMode === 'freeform') ||
				(block?.type === 'images' &&
					block.gallery.carousel !== true &&
					block.gallery.layout !== 'grid')
			);
		});
	};
	const embedKindOf = (block: Extract<PageBlock, { type: 'embed' }>): EmbedKind =>
		embedSpec(block.url)?.kind ?? embedKindForInput(block.url) ?? block.kind ?? 'video';
	const embedLabelOf = (block: Extract<PageBlock, { type: 'embed' }>): string =>
		embedSpec(block.url)?.provider ?? embedKindLabel(embedKindOf(block));
	const phoneItemsFor = (config: GalleryConfig, includePinnedBlocks = false): MobileArrangementItem[] => {
		const entries = doc.galleries[config.folder] ?? [];
		const flowed = flowMissing(entries.map((entry) => ({ layout: entry.meta.layout, ar: entry.meta.layout?.ar ?? DEFAULT_AR })));
		const artwork = entries.map((entry, index) => ({
			item: {
				key: `image:${entry.id}`,
				label: entry.meta.title || entry.filename || `Image ${index + 1}`,
				kind: 'image' as const,
				thumbnail: getAssetPreviewUrl(entry.assetId) ?? undefined,
			},
			y: entry.meta.layout?.y ?? flowed.get(index)?.y ?? index * 30,
		}));
		// A freeform canvas automatically stacks by its desktop vertical position.
		// Seed customization from that same order so opting in never changes the site
		// before the artist actually moves or resizes something. Grid mode keeps the
		// image-list order because that is what its automatic phone grid already uses.
		const arrangedArtwork = config.layout === 'grid'
			? artwork
			: automaticPhoneOrder(
					artwork.map(({ item, y }, index) => ({ key: item.key, y, kind: 'image', index })),
				).map((key) => artwork.find((entry) => entry.item.key === key)!);
		if (!includePinnedBlocks) return arrangedArtwork.map(({ item }) => item);
		const hostBlock = blocks.find(
			(block) =>
				(block.type === 'gallery' && page.gallery?.folder === config.folder) ||
				(block.type === 'images' && block.gallery.folder === config.folder),
		);
		const sectionBlockIds = new Set(
			sectionForBlock(hostBlock?.id ?? '')?.blockIds ?? [],
		);
		const pinned = blocks.flatMap<{
			item: MobileArrangementItem;
			y: number;
			kind: 'text' | 'video';
			index: number;
		}>((block, index) => {
			if (!sectionBlockIds.has(block.id)) return [];
			if (block.type === 'text' && block.layout) {
				const words = block.text.trim().replace(/\s+/g, ' ');
				return [{ item: { key: `text:${block.id}`, label: words ? words.slice(0, 45) : 'Text', kind: 'text' }, y: block.layout.y, kind: 'text', index }];
			}
			if (block.type === 'embed' && block.layout)
				return [{
					item: { key: `video:${block.id}`, label: embedLabelOf(block), kind: 'video' },
					y: block.layout.y,
					kind: 'video',
					index,
				}];
			return [];
		});
		const all = [
			...arrangedArtwork.map((entry, index) => ({ ...entry, kind: 'image' as const, index })),
			...pinned,
		];
		const byKey = new Map(all.map((entry) => [entry.item.key, entry.item]));
		return automaticPhoneOrder(
			all.map((entry) => ({ key: entry.item.key, y: entry.y, kind: entry.kind, index: entry.index })),
		).map((key) => byKey.get(key)!);
	};
	const pagePhoneItems: MobileArrangementItem[] = [
		...(page.heading?.trim()
			? [{ key: 'page:heading', label: `Page heading: ${page.heading.trim().slice(0, 45)}`, kind: 'section' as const }]
			: []),
		...(page.project
			? [{ key: 'page:project', label: 'Project details', kind: 'section' as const }]
			: []),
		...sections.map((section, index) => ({
			key: sectionPartKey(section.id),
			label: `Section ${index + 1}: ${section.name}`,
			kind: 'section' as const,
		})),
	];
	const motionSectionItems = [
		...(page.heading?.trim()
			? [{ key: 'page:heading', label: `Heading — ${page.heading.trim().slice(0, 38)}` }]
			: []),
		...(page.project ? [{ key: 'page:project', label: 'Project details' }] : []),
		...sections.map((section, index) => ({
			key: sectionPartKey(section.id),
			label: `Section ${index + 1} — ${section.name}`,
		})),
	];

	const addChild = () => {
		const name = prompt('Name of the new sub-page:');
		if (name?.trim()) editor.addChildPage(pageKey, name.trim());
	};
	const runAdd = (action: () => void, scrollToNewBlock = true) => {
		const before = new Set(blocks.map((block) => block.id));
		addMenuRef.current?.removeAttribute('open');
		floatingAddMenuRef.current?.removeAttribute('open');
		action();
		if (!scrollToNewBlock) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const added = Array.from(
					pageContentRef.current?.querySelectorAll<HTMLElement>('[data-editor-block]') ?? [],
				).find((element) => !before.has(element.dataset.editorBlock ?? ''));
				added?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}),
		);
	};

	const closeBlockMenus = () => {
		addMenuRef.current?.removeAttribute('open');
		floatingAddMenuRef.current?.removeAttribute('open');
		pageContentRef.current
			?.querySelectorAll<HTMLDetailsElement>('details.section-add-block[open]')
			.forEach((menu) => menu.removeAttribute('open'));
	};
	const performSectionAdd = (
		action: (sectionId: string) => void,
		sectionId: string,
	) => {
		closeBlockMenus();
		runAdd(() => action(sectionId));
	};
	const runSectionAdd = (
		action: (sectionId: string) => void,
		requestedSectionId?: string,
		label = 'block',
	) => {
		if (requestedSectionId) {
			performSectionAdd(action, requestedSectionId);
			return;
		}
		setPendingSectionAdd({ label, action });
		closeBlockMenus();
	};

	const setCollectionCanvasPlacement = (
		block: Extract<PageBlock, { type: 'children' | 'products' }>,
	) => {
		if (block.canvasLayout) {
			editor.setWidgetLayout(pageKey, block.id, undefined);
			return;
		}
		const owner = sectionForBlock(block.id);
		if (!owner) return;
		if (!sectionHasFreeCanvas(owner.id))
			editor.addFreeformGallery(pageKey, block.id, owner.id);
		editor.setWidgetLayout(
			pageKey,
			block.id,
			collectionLayoutAtCanvasBottom(
				block.type,
				canvasBottomForBlock(block.id),
			),
		);
	};

	const collectionCanvasControl = (
		block: Extract<PageBlock, { type: 'children' | 'products' }>,
		label: string,
	) => (
		<div className={`collection-canvas-control${block.canvasLayout ? ' active' : ''}`}>
			<span>
				<strong>{block.canvasLayout ? 'Freeform canvas placement' : 'Page flow placement'}</strong>
				<small>
					{block.canvasLayout
						? `Drag or resize the complete ${label} block in the preview.`
						: `Place the complete ${label} block anywhere, like text or images.`}
				</small>
			</span>
			<button
				type="button"
				className={block.canvasLayout ? 'btn-secondary' : 'btn-primary'}
				onClick={() => setCollectionCanvasPlacement(block)}
			>
				{block.canvasLayout ? 'Return to page flow' : 'Freeform'}
			</button>
		</div>
	);

	const addBlockMenuItems = (sectionId?: string) => (
		<>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addTextBlock(pageKey, target), sectionId, 'text')}>Text</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addImagesBlock(pageKey, target), sectionId, 'image group')}>Image group</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'video', target), sectionId, 'video')}>Video</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addShotsBlock(pageKey, target), sectionId, 'Shots video')}>Shots / scroll video</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'audio', target), sectionId, 'music player')}>Music player</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'map', target), sectionId, 'Google Map')}>Google Map</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addButtonBlock(pageKey, target), sectionId, 'button')}>Button</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addDividerBlock(pageKey, target), sectionId, 'divider')}>Divider</button>
			{!hasAboutBlock && (
				<button type="button" onClick={() => runSectionAdd((target) => editor.addAboutBlock(pageKey, target), sectionId, 'About content')}>About content</button>
			)}
			<button type="button" onClick={() => runSectionAdd((target) => editor.addFormBlock(pageKey, target), sectionId, 'contact form')}>Contact form</button>
			<button
				type="button"
				onClick={() => {
					runSectionAdd(
						(target) => {
							if (doc.content.store) editor.addProductsBlock(pageKey, target);
							else showEditorTab('store');
						},
						sectionId,
						doc.content.store ? 'products' : 'products setup',
					);
				}}
			>
				{doc.content.store ? 'Products' : 'Set up products…'}
			</button>
			{!nested && <button type="button" onClick={() => runAdd(addChild, false)}>Sub-page</button>}
			{(doc.content.sectionLibrary?.length ?? 0) > 0 && (
				<>
					<span className="add-menu-heading">Reuse a saved block</span>
					{doc.content.sectionLibrary!.map((template) => (
						<button
							type="button"
							className="saved-section-menu-item"
							key={template.id}
							onClick={() =>
								runSectionAdd(
									(target) =>
										editor.insertSectionTemplate(pageKey, template.id, target),
									sectionId,
									template.name,
								)
							}
						>
							↙ {template.name}
						</button>
					))}
				</>
			)}
		</>
	);

	/** Bake the current Grid arrangement into freeform coordinates and switch to
	 *  Freeform, so the images start exactly where the grid showed them. Aspect
	 *  ratios come from the crop (when set) or the images' real pixels. */
	const adoptGridAsFreeform = async (config: GalleryConfig, onPatch: (patch: GalleryPatch) => void) => {
		const entries = doc.galleries[config.folder] ?? [];
		if (entries.length === 0) {
			onPatch({ layout: undefined });
			return;
		}
		const cellAr = parseAspect(config.aspect);
		const ars = await Promise.all(
			entries.map(
				async (e) =>
					cellAr ?? (await measureAr(getAssetPreviewUrl(e.assetId))) ?? e.meta.layout?.ar ?? DEFAULT_AR,
			),
		);
		const layouts = uniformGridLayouts(ars, uniformColumns(config.columns));
		editor.setGalleryLayouts(
			config.folder,
			Object.fromEntries(entries.map((e, i) => [e.id, roundLayout(layouts[i])])),
		);
		onPatch({ layout: undefined });
	};

	/** Lowest occupied edge in this block's section. Every freeform widget uses
	 * this shared placement rule, so adding one never covers work at the top. */
	function canvasBottomForBlock(blockId: string): number {
		let bottom = 18;
		const owner = sectionForBlock(blockId);
		const ownerBlocks = new Set(owner?.blockIds ?? []);
		const host = owner?.blockIds
			.map((id) => blockById.get(id))
			.find(
				(candidate) =>
					(candidate?.type === 'gallery' && page.gallery?.layout !== 'grid') ||
					(candidate?.type === 'images' &&
						candidate.gallery.carousel !== true &&
						candidate.gallery.layout !== 'grid'),
			);
		const config =
			host?.type === 'gallery'
				? page.gallery
				: host?.type === 'images'
					? host.gallery
					: undefined;
		if (config) {
			const entries = doc!.galleries[config.folder] ?? [];
			const flowed = flowMissing(
				entries.map((entry) => ({
					layout: entry.meta.layout,
					ar: entry.meta.layout?.ar ?? DEFAULT_AR,
				})),
			);
			const imageLayouts = entries.flatMap((entry, entryIndex) => {
				const layout = entry.meta.layout ?? flowed.get(entryIndex);
				return layout ? [layout] : [];
			});
			bottom = Math.max(bottom, canvasHeight(imageLayouts));
			for (const candidate of blocks) {
				if (candidate.id === blockId || !ownerBlocks.has(candidate.id)) continue;
				if (candidate.type === 'text' && candidate.layout)
					bottom = Math.max(bottom, textBottom(candidate.layout));
				if (candidate.type === 'embed' && candidate.layout)
					bottom = Math.max(bottom, bottomOf(candidate.layout));
				if (
					(candidate.type === 'children' || candidate.type === 'products') &&
					candidate.canvasLayout
				)
					bottom = Math.max(bottom, bottomOf(candidate.canvasLayout));
				if (
					candidate.type === 'images' &&
					candidate.gallery.carousel &&
					candidate.gallery.carouselFrame
				)
					bottom = Math.max(bottom, bottomOf(candidate.gallery.carouselFrame));
			}
		}
		return bottom;
	}

	/** Put a newly pinned text box after the lowest existing canvas item and
	 * center it horizontally, so it is immediately visible without covering art. */
	const textLayoutAtCanvasBottom = (block: Extract<PageBlock, { type: 'text' }>) => {
		const width = Math.min(block.flowLayout?.w ?? 50, 60);
		return roundTextLayout({
			x: (100 - width) / 2,
			y: canvasBottomForBlock(block.id) + 2,
			w: width,
		});
	};

	/** Place a player/map below existing canvas content, or centered in its own
	 * canvas section when the page does not have a primary image canvas. */
	const embedLayoutAtCanvasBottom = (block: Extract<PageBlock, { type: 'embed' }>) => {
		const spec = embedSpec(block.url);
		const kind = spec?.kind ?? embedKindOf(block);
		const width = kind === 'map' ? 72 : kind === 'audio' ? 68 : 60;
		return roundLayout({
			x: (100 - width) / 2,
			y: canvasBottomForBlock(block.id) + 2,
			w: width,
			ar: spec?.aspectRatio ?? (kind === 'map' ? 4 / 3 : kind === 'audio' ? 5.4 : 16 / 9),
		});
	};

	const controls = (index: number, block: PageBlock, removable: boolean) => {
		const name =
			block.type === 'images' ? block.name || 'image group' :
			block.type === 'embed' ? embedKindLabel(embedKindOf(block)).toLowerCase() :
			block.type === 'shots' ? 'shots / scroll video' :
			block.type === 'children' ? 'sub-pages' :
			block.type === 'products' ? 'products' :
			block.type === 'form' ? 'contact form' :
			block.type === 'divider' ? 'divider' : block.type;
		const blockLabel = `${name} block ${index + 1} on ${pageName}`;
		const owner = sectionForBlock(block.id);
		const position = owner?.blockIds.indexOf(block.id) ?? -1;
		const collapsed = itemIsCollapsed('block', block.id);
		return <div className="block-controls" role="group" aria-label={`Actions for ${blockLabel}`}>
			<button
				type="button"
				className="btn-icon block-collapse-toggle"
				aria-expanded={!collapsed}
				title={collapsed ? `Expand ${name} block` : `Collapse ${name} block`}
				onClick={() => toggleEditorItem('block', block.id)}
				aria-label={collapsed ? `Expand ${blockLabel}` : `Collapse ${blockLabel}`}
			>
				<span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
			</button>
			<button
				type="button"
				className="btn-secondary save-section-button"
				title="Save this block so you can reuse it on any page"
				onClick={() => {
					const savedName = prompt('Name this reusable block:', `${name} block`);
					if (savedName?.trim())
						editor.saveSectionTemplate(pageKey, block.id, savedName.trim());
				}}
				aria-label={`Save ${blockLabel} for reuse`}
			>
				☆ Save block
			</button>
			<button
				type="button"
				className="btn-secondary block-section-toggle"
				data-tour="section-control"
				title="Move this block to another section or a new section"
				onClick={() => {
					if (!owner) return;
					setPendingSectionMove({
						blockId: block.id,
						label: name,
						sourceSectionId: owner.id,
					});
					closeBlockMenus();
				}}
				aria-label={`Move ${blockLabel} to another section`}
			>
				▣ Move section…
			</button>
			<button
				type="button"
				className="btn-icon"
				disabled={!owner || position <= 0}
				onClick={() => owner && editor.moveBlockInSection(pageKey, owner.id, position, position - 1)}
				aria-label={`Move ${blockLabel} earlier`}
			>
				↑
			</button>
			<button
				type="button"
				className="btn-icon"
				disabled={!owner || position < 0 || position === owner.blockIds.length - 1}
				onClick={() => owner && editor.moveBlockInSection(pageKey, owner.id, position, position + 1)}
				aria-label={`Move ${blockLabel} later`}
			>
				↓
			</button>
			{removable && (
				<button
					type="button"
					className="btn-icon danger"
					onClick={() => {
						if (
							block.type === 'about' &&
							!confirm('Remove the About content from this page? You can add it again later from Add block.')
						) return;
						editor.removeBlock(pageKey, block.id);
					}}
					aria-label={`Delete ${blockLabel}`}
				>
					✕
				</button>
			)}
		</div>;
	};

	const renderBlock = (block: PageBlock, index: number) => {
		const ownerSection = sectionForBlock(block.id);
		const blockHasFreeCanvas = ownerSection
			? sectionHasFreeCanvas(ownerSection.id)
			: false;
		switch (block.type) {
			case 'text': {
				const textLabel = `text block ${index + 1} on ${pageName}`;
				const fontLinked = !block.fontFamily;
				const isCanvasPlaced = !!block.layout;
				const flowLayout = clampTextFlowLayout(block.flowLayout ?? { x: 0, w: 100 });
				const setFlowLayout = (patch: Partial<typeof flowLayout>) =>
					editor.setTextFlowLayout(
						pageKey,
						block.id,
						clampTextFlowLayout({ ...flowLayout, ...patch }),
					);
				return (
					<div className="block text-box-editor-block" key={block.id}>
						<div className="block-head text-block-head">
							<span className="block-label">Text box</span>
							{controls(index, block, true)}
						</div>
						<RichTextEditor
							value={block.richText}
							legacyText={block.text}
							legacyStyle={block.style}
							legacyAlign={block.align}
							fontFamily={block.fontFamily ?? doc.content.theme.fontFamily}
							label={textLabel}
							onChange={(text, richText) =>
								editor.updateRichTextBlock(pageKey, block.id, text, richText)
							}
						/>
						<div className="text-box-font-row">
							<label>
								<span>Font</span>
								<select
									className="select-input"
									value={block.fontFamily ?? ''}
									aria-label={`Font for ${textLabel}`}
									onChange={(event) =>
										editor.setTextFont(pageKey, block.id, event.target.value || undefined)
									}
								>
									<option value="">Page font — linked</option>
									{textFontOptions.map((font) => (
										<option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
											{font.label}
										</option>
									))}
								</select>
							</label>
							<span className={`text-font-status ${fontLinked ? 'linked' : 'independent'}`}>
								{fontLinked ? 'Linked to page font' : 'Independent font'}
							</span>
							{!fontLinked && (
								<button
									type="button"
									className="btn-link"
									onClick={() => editor.setTextFont(pageKey, block.id, undefined)}
								>
									Reset to page font
								</button>
							)}
						</div>
						<div className="kinetic-editor-row">
							<label>
								<span>Type motion</span>
								<select
									className="select-input"
									value={block.kinetic?.effect ?? ''}
									aria-label={`Type motion for ${textLabel}`}
									onChange={(event) => {
										const effect = event.target.value as KineticTextEffect | '';
										editor.setTextKinetic(
											pageKey,
											block.id,
											effect
												? { effect, speed: block.kinetic?.speed ?? 100 }
												: undefined,
										);
									}}
								>
									{KINETIC_TEXT_EFFECTS.map((effect) => (
										<option key={effect.value || 'still'} value={effect.value}>
											{effect.label}
										</option>
									))}
								</select>
							</label>
							{block.kinetic && (
								<>
									<label className="kinetic-speed">
										<span>Tempo <output>{block.kinetic.speed ?? 100}%</output></span>
										<input
											type="range"
											min={50}
											max={200}
											step={5}
											value={block.kinetic.speed ?? 100}
											aria-label={`Type motion tempo for ${textLabel}`}
											onChange={(event) =>
												editor.setTextKinetic(pageKey, block.id, {
													...block.kinetic!,
													speed: Number(event.target.value),
												})
											}
										/>
									</label>
									<label className="effect-phone-control">
										<input
											type="checkbox"
											checked={block.kinetic.phone !== false}
											onChange={(event) =>
												editor.setTextKinetic(pageKey, block.id, {
													...block.kinetic!,
													phone: event.target.checked ? undefined : false,
												})
											}
										/>
										Use on phones
									</label>
									<button
										type="button"
										className="btn-secondary kinetic-preview-button"
										onClick={() =>
											previewTypeMotion(pageKey, `block:${block.id}`)
										}
									>
										▶ Preview motion
									</button>
								</>
							)}
						</div>
						<details className="block-options">
							<summary aria-label={`Link all of ${textLabel}`}>Link the entire text box</summary>
							<p className="muted">For individual words, select them above and press Link in the toolbar.</p>
							<input
								className={`text-input ${!isPageOrWebLink(block.link ?? '') ? 'invalid' : ''}`}
								value={block.link ?? ''}
								placeholder="https://…"
								aria-label={`Link for ${textLabel}`}
								onChange={(event) => editor.setTextLink(pageKey, block.id, event.target.value)}
							/>
							{!isPageOrWebLink(block.link ?? '') && <span className="field-error">Use a full web address beginning with https://.</span>}
						</details>
						{!isCanvasPlaced && (
							<div className="text-flow-layout" role="group" aria-label={`Width and position for ${textLabel}`}>
								<div className="text-flow-layout-head">
									<span>
										<strong>Box width &amp; position</strong>
										<small>Adjust this text box within the page.</small>
									</span>
									{block.flowLayout && (
										<button
											type="button"
											className="btn-link"
											onClick={() => editor.setTextFlowLayout(pageKey, block.id, undefined)}
										>
											Reset
										</button>
									)}
								</div>
								<label className="text-flow-slider">
									<span>Width <output>{Math.round(flowLayout.w)}%</output></span>
									<input
										type="range"
										min="20"
										max="100"
										step="1"
										value={flowLayout.w}
										aria-label={`Width for ${textLabel}`}
										onChange={(event) => {
											const w = Number(event.target.value);
											setFlowLayout({ w, x: Math.min(flowLayout.x, 100 - w) });
										}}
									/>
								</label>
								<label className="text-flow-slider">
									<span>Position <output>{Math.round(flowLayout.x)}%</output></span>
									<input
										type="range"
										min="0"
										max={100 - flowLayout.w}
										step="1"
										value={flowLayout.x}
										disabled={flowLayout.w === 100}
										aria-label={`Horizontal position for ${textLabel}`}
										onChange={(event) => setFlowLayout({ x: Number(event.target.value) })}
									/>
								</label>
								<div className="text-flow-presets" role="group" aria-label={`Position presets for ${textLabel}`}>
									<button type="button" className="btn-chip" onClick={() => setFlowLayout({ x: 0 })}>Left</button>
									<button
										type="button"
										className="btn-chip"
										onClick={() => setFlowLayout({ x: (100 - flowLayout.w) / 2 })}
									>
										Center
									</button>
									<button
										type="button"
										className="btn-chip"
										onClick={() => setFlowLayout({ x: 100 - flowLayout.w })}
									>
										Right
									</button>
								</div>
							</div>
						)}
						{isCanvasPlaced ? (
							<div className="text-box-canvas-status">
								<span>Placed on the canvas — drag the box to move it; drag its blue corner to resize.</span>
								<button
									type="button"
									className="btn-secondary text-placement-button"
									onClick={() => editor.setTextLayout(pageKey, block.id, undefined)}
								>
									Back to normal flow
								</button>
							</div>
						) : (
							!!block.text.trim() && (
								<div className="text-box-canvas-status">
									<span>
										{blockHasFreeCanvas
											? 'Drag this text box in the preview to place it anywhere on the image canvas.'
											: 'Choose Freeform to create a canvas and place this text box at its bottom.'}
									</span>
										<button
											type="button"
											className="btn-secondary text-placement-button"
											onClick={() => {
												if (!blockHasFreeCanvas)
													editor.addFreeformGallery(
														pageKey,
														block.id,
														ownerSection?.id,
													);
												editor.setTextLayout(
													pageKey,
													block.id,
													textLayoutAtCanvasBottom(block),
												);
											}}
										>
											Freeform
										</button>
								</div>
							)
						)}
					</div>
				);
			}
			case 'embed': {
				const isBuy = !!stripePaymentLink(block.url);
				const spec = embedSpec(block.url);
				const kind = spec?.kind ?? embedKindOf(block);
				const moduleLabel = isBuy ? 'Buy button' : embedKindLabel(kind);
				const blockLabel = `${moduleLabel.toLowerCase()} block ${index + 1} on ${pageName}`;
				const invalid = !!block.url.trim() && !spec && !isBuy;
				const isCanvasPlaced = !!block.layout;
				const flowLayout = clampTextFlowLayout(
					block.flowLayout ??
						(kind === 'audio' ? { x: 15, w: 70 } : { x: 10, w: 80 }),
				);
				const setFlowLayout = (patch: Partial<typeof flowLayout>) =>
					editor.setEmbedFlowLayout(
						pageKey,
						block.id,
						clampTextFlowLayout({ ...flowLayout, ...patch }),
					);
				const placeholder =
					kind === 'audio'
						? 'SoundCloud link or Bandcamp Share / Embed code'
						: kind === 'map'
							? 'Google Maps place URL or Share → Embed a map code'
							: 'YouTube, Vimeo or Stripe payment link';
				const error =
					kind === 'audio' && block.url.toLowerCase().includes('bandcamp.com')
						? 'For Bandcamp, use Share / Embed on the track or album and paste the iframe code here.'
						: kind === 'audio'
							? 'Paste a SoundCloud track or playlist link, or Bandcamp’s Share / Embed iframe code.'
							: kind === 'map'
								? 'Paste a full Google Maps place/search URL or the iframe code from Share → Embed a map.'
								: 'That doesn’t look like a YouTube, Vimeo, or Stripe payment link.';
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">{moduleLabel}</span>
							{controls(index, block, true)}
						</div>
						<input
							className={`text-input ${invalid ? 'invalid' : ''}`}
							aria-label={`${placeholder} for ${blockLabel}`}
							placeholder={placeholder}
							value={block.url}
							onChange={(e) => editor.updateEmbedBlock(pageKey, block.id, e.target.value)}
						/>
						{!isCanvasPlaced && (
							<div
								className="text-flow-layout embed-flow-layout-controls"
								role="group"
								aria-label={`Width and position for ${blockLabel}`}
							>
								<div className="text-flow-layout-head">
									<span>
										<strong>Widget width &amp; position</strong>
										<small>
											Resize from here or drag the blue corner in the preview.
										</small>
									</span>
									{block.flowLayout && (
										<button
											type="button"
											className="btn-link"
											onClick={() =>
												editor.setEmbedFlowLayout(pageKey, block.id, undefined)
											}
										>
											Reset
										</button>
									)}
								</div>
								<label className="text-flow-slider">
									<span>
										Width <output>{Math.round(flowLayout.w)}%</output>
									</span>
									<input
										type="range"
										min={20}
										max={100}
										step={1}
										value={flowLayout.w}
										aria-label={`Width for ${blockLabel}`}
										onChange={(event) => {
											const w = Number(event.target.value);
											setFlowLayout({
												w,
												x: Math.min(flowLayout.x, 100 - w),
											});
										}}
									/>
								</label>
								<label className="text-flow-slider">
									<span>
										Position <output>{Math.round(flowLayout.x)}%</output>
									</span>
									<input
										type="range"
										min={0}
										max={100 - flowLayout.w}
										step={1}
										value={flowLayout.x}
										disabled={flowLayout.w === 100}
										aria-label={`Horizontal position for ${blockLabel}`}
										onChange={(event) =>
											setFlowLayout({ x: Number(event.target.value) })
										}
									/>
								</label>
								<div
									className="text-flow-presets"
									role="group"
									aria-label={`Position presets for ${blockLabel}`}
								>
									<button
										type="button"
										className="btn-chip"
										onClick={() => setFlowLayout({ x: 0 })}
									>
										Left
									</button>
									<button
										type="button"
										className="btn-chip"
										onClick={() =>
											setFlowLayout({ x: (100 - flowLayout.w) / 2 })
										}
									>
										Center
									</button>
									<button
										type="button"
										className="btn-chip"
										onClick={() => setFlowLayout({ x: 100 - flowLayout.w })}
									>
										Right
									</button>
								</div>
							</div>
						)}
						{invalid ? (
							<span className="field-error">{error}</span>
						) : isCanvasPlaced ? (
							<div className="text-box-canvas-status embed-canvas-status">
								<span>
									Placed on the canvas — use its blue drag grip to move it and its corner handle
									to resize. The player or map stays interactive.
								</span>
								<button
									type="button"
									className="btn-secondary text-placement-button"
									onClick={() => editor.setEmbedLayout(pageKey, block.id, undefined)}
								>
									Back to normal flow
								</button>
							</div>
						) : (spec || isBuy) && !!block.url.trim() ? (
							<div className="text-box-canvas-status embed-canvas-status">
								<span>
									{blockHasFreeCanvas
										? `${spec?.provider ?? moduleLabel} is live in the preview. Place it on the image canvas whenever you want.`
										: `${spec?.provider ?? moduleLabel} is live and resizable in normal flow. Choose Freeform to place it anywhere.`}
								</span>
								<button
									type="button"
									className="btn-secondary text-placement-button"
									onClick={() => {
										if (!blockHasFreeCanvas)
											editor.addFreeformGallery(
												pageKey,
												block.id,
												ownerSection?.id,
											);
										editor.setEmbedLayout(
											pageKey,
											block.id,
											embedLayoutAtCanvasBottom(block),
										);
									}}
								>
									Freeform
								</button>
							</div>
						) : (
							<p className="muted">
								{kind === 'audio'
									? 'Visitors can play SoundCloud or Bandcamp without leaving your site.'
									: kind === 'map'
										? 'Visitors can pan, zoom, and open directions from the map.'
										: 'The video plays right on your page.'}
							</p>
						)}
					</div>
				);
			}
			case 'shots': {
				const sourceInvalid = !block.assetId && !isShotsSource(block.src);
				const sourceLabel = block.filename || (block.src.trim() ? 'Direct video link' : 'No clip selected');
				const fadeStart = Math.min(Math.max(block.fadeStart ?? 70, 0), 95);
				const fadeDuration = Math.min(
					Math.max(block.fadeDuration ?? 30, 5),
					100 - fadeStart,
				);
				return (
					<div className="block shots-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Shots / scroll video</span>
							{controls(index, block, true)}
						</div>
						<p className="muted shots-editor-intro">
							A short, muted clip whose playhead follows the visitor’s scroll.
						</p>
						<div className="shots-source-actions">
							<label className="btn-secondary shots-upload-button">
								Upload MP4 or WebM
								<input
									type="file"
									accept="video/mp4,video/webm,.mp4,.webm"
									hidden
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = '';
										if (!file) return;
										if (!isVideoFile(file)) {
											alert('Choose an MP4 or WebM video.');
											return;
										}
										if (file.size > MAX_VIDEO_BYTES) {
											alert(`Keep scroll videos under ${MAX_VIDEO_MB} MB.`);
											return;
										}
										editor.setShotsFile(pageKey, block.id, file);
									}}
								/>
							</label>
							<span className="shots-source-name" title={sourceLabel}>{sourceLabel}</span>
							{(block.assetId || block.src.trim()) && (
								<button
									type="button"
									className="btn-link"
									onClick={() =>
										editor.updateShotsBlock(pageKey, block.id, { src: '' })
									}
								>
									Remove
								</button>
							)}
						</div>
						<Field
							label="Or paste a direct video URL"
							hint="Use a direct https:// link to an MP4 or WebM file. Pasting here replaces an uploaded clip."
							error={sourceInvalid ? 'Use a direct web video URL.' : undefined}
						>
							<TextInput
								className={`text-input${sourceInvalid ? ' invalid' : ''}`}
								value={block.assetId ? '' : block.src}
								placeholder="https://cdn.example.com/short-film.mp4"
								onChange={(event) =>
									editor.updateShotsBlock(pageKey, block.id, {
										src: event.target.value,
									})
								}
							/>
						</Field>
						<div className="shots-options-grid">
							<label className="motion-range">
								<span>
									Scroll length <output>{block.scrollLength ?? 260}vh</output>
								</span>
								<input
									type="range"
									min={140}
									max={500}
									step={10}
									value={block.scrollLength ?? 260}
									onChange={(event) =>
										editor.updateShotsBlock(pageKey, block.id, {
											scrollLength: Number(event.target.value),
										})
									}
								/>
							</label>
							<label>
								<span className="field-label">Video fit</span>
								<select
									className="select-input"
									value={block.fit ?? 'cover'}
									onChange={(event) =>
										editor.updateShotsBlock(pageKey, block.id, {
											fit: event.target.value as 'cover' | 'contain',
										})
									}
								>
									<option value="cover">Fill the screen</option>
									<option value="contain">Show the whole frame</option>
								</select>
							</label>
						</div>
						<div className="shots-checks">
							<label className="compact-check">
								<input
									type="checkbox"
									checked={block.fadeIntoPage !== false}
									onChange={(event) =>
										editor.updateShotsBlock(pageKey, block.id, {
											fadeIntoPage: event.target.checked,
										})
									}
								/>
								Fade into following page content
							</label>
							<label className="compact-check">
								<input
									type="checkbox"
									checked={block.phone ?? false}
									onChange={(event) =>
										editor.updateShotsBlock(pageKey, block.id, {
											phone: event.target.checked || undefined,
										})
									}
								/>
								Scrub on phones
							</label>
						</div>
						{block.fadeIntoPage !== false && (
							<div
								className="shots-fade-options"
								role="group"
								aria-label="Scroll video fade timing"
							>
								<label className="motion-range">
									<span>
										Fade starts <output>{fadeStart}%</output>
									</span>
									<input
										type="range"
										min={0}
										max={95}
										step={1}
										value={fadeStart}
										onChange={(event) => {
											const nextStart = Number(event.target.value);
											editor.updateShotsBlock(pageKey, block.id, {
												fadeStart: nextStart,
												fadeDuration: Math.min(fadeDuration, 100 - nextStart),
											});
										}}
									/>
								</label>
								<label className="motion-range">
									<span>
										Fade length <output>{fadeDuration}%</output>
									</span>
									<input
										type="range"
										min={5}
										max={100 - fadeStart}
										step={1}
										value={fadeDuration}
										onChange={(event) =>
											editor.updateShotsBlock(pageKey, block.id, {
												fadeDuration: Number(event.target.value),
											})
										}
									/>
								</label>
								<small>
									The timing is measured across the full scroll scene.
								</small>
							</div>
						)}
						<p className="muted">
							On reduced-motion devices—and on phones unless enabled—the clip becomes a normal video with controls.
						</p>
					</div>
				);
			}
			case 'gallery':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Images</span>
							{controls(index, block, true)}
						</div>
						{page.gallery && (
							<details className="block-options image-layout-options">
								<summary>
									Layout &amp; mobile <span>{galleryMode === 'grid' ? 'Grid' : 'Freeform'}</span>
								</summary>
								<div className="image-layout-options-body">
									<LayoutToggle label={`main images on ${pageName}`} mode={galleryMode} onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)} />
									{galleryMode === 'grid' && (
										<GridOptions
											config={page.gallery}
											label={`${blockHasFreeCanvas ? 'main canvas' : 'main images'} on ${pageName}`}
											onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)}
											onAdopt={() =>
												void adoptGridAsFreeform(page.gallery!, (patch) => editor.setGalleryConfig(pageKey, patch))
											}
										/>
									)}
									{(phoneItemsFor(page.gallery, blockHasFreeCanvas).length > 0 || page.gallery.mobile) && (
										<MobileArrangementEditor
											items={phoneItemsFor(page.gallery, blockHasFreeCanvas)}
											mobile={page.gallery.mobile}
											gridMode={galleryMode === 'grid'}
											label={`main images on ${pageName}`}
											onChange={(mobile) => editor.setGalleryConfig(pageKey, { mobile })}
										/>
									)}
								</div>
							</details>
						)}
						{page.gallery && (
							<ImageCollectionEditor
								embedded
								folder={page.gallery.folder}
								variant={isHome ? 'projects' : 'gallery'}
								addLabel="+ Add image(s)"
								emptyLabel="No images yet."
								hint={
									galleryMode === 'grid'
										? 'Images auto-arrange into a neat grid — pick columns and crop above. ⠿ here sets the order.'
										: undefined
								}
							/>
						)}
					</div>
				);
			case 'images': {
				const groupMode = block.gallery.layout === 'grid' ? 'grid' : 'freeform';
				const patchGroup = (patch: GalleryPatch) => editor.updateImagesBlock(pageKey, block.id, patch);
				const groupLabel = `${block.name || `image group ${index + 1}`} on ${pageName}`;
				const carousel = block.gallery.carousel === true;
				const carouselHostBlock = block.gallery.carouselHost
					? blocks.find(
							(candidate) =>
								candidate.id === block.gallery.carouselHost &&
								(candidate.type === 'gallery' ||
									(candidate.type === 'images' &&
										candidate.gallery.carousel !== true &&
										candidate.gallery.layout !== 'grid')),
						)
					: undefined;
				const carouselFrame = block.gallery.carouselFrame ?? DEFAULT_CAROUSEL_FRAME;
				const carouselRatio =
					CAROUSEL_RATIOS.find((option) => Math.abs(option.ar - carouselFrame.ar) < 0.01)?.value ?? 'custom';
				const setCarouselRatio = (value: string) => {
					const option = CAROUSEL_RATIOS.find((candidate) => candidate.value === value);
					if (!option) return;
					patchGroup({
						carouselFreeResize: undefined,
						carouselFrame: roundLayout({ ...carouselFrame, ar: option.ar }),
					});
				};
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<input
								className="block-name-input"
								value={block.name ?? ''}
								placeholder="Image group"
								title="Name this group (only shown here in the editor)"
								aria-label={`Name for ${groupLabel}`}
								onChange={(e) => editor.renameImagesBlock(pageKey, block.id, e.target.value)}
							/>
							{controls(index, block, true)}
						</div>
						<details className="block-options image-layout-options">
							<summary>
								Layout &amp; mobile <span>{carousel ? 'Carousel' : groupMode === 'grid' ? 'Grid' : 'Freeform'}</span>
							</summary>
							<div className="image-layout-options-body">
								<LayoutToggle
									label={groupLabel}
									mode={carousel ? 'carousel' : groupMode}
									onPatch={patchGroup}
									carousel
								/>
								{carousel && (
									<div className="carousel-settings">
										<div className="align-toggle carousel-fit-toggle" role="group" aria-label={`Image sizing for ${groupLabel}`}>
											<button
												type="button"
												className={`btn-icon btn-chip ${(block.gallery.carouselFit ?? 'fit') === 'fit' ? 'active' : ''}`}
												aria-pressed={(block.gallery.carouselFit ?? 'fit') === 'fit'}
												onClick={() => patchGroup({ carouselFit: undefined })}
											>
												Fit image
											</button>
											<button
												type="button"
												className={`btn-icon btn-chip ${block.gallery.carouselFit === 'fill' ? 'active' : ''}`}
												aria-pressed={block.gallery.carouselFit === 'fill'}
												onClick={() => patchGroup({ carouselFit: 'fill' })}
											>
												Fill frame
											</button>
										</div>
										<div
											className="align-toggle carousel-drag-toggle"
											role="group"
											aria-label={`Drag behavior for ${groupLabel}`}
										>
											<button
												type="button"
												className={`btn-icon btn-chip ${block.gallery.carouselMoveImage !== true ? 'active' : ''}`}
												aria-pressed={block.gallery.carouselMoveImage !== true}
												onClick={() => patchGroup({ carouselMoveImage: undefined })}
											>
												Move carousel
											</button>
											<button
												type="button"
												className={`btn-icon btn-chip ${block.gallery.carouselMoveImage === true ? 'active' : ''}`}
												aria-pressed={block.gallery.carouselMoveImage === true}
												onClick={() => patchGroup({ carouselMoveImage: true })}
											>
												Move image
											</button>
										</div>
										<div className="carousel-frame-options">
											<label className="compact-check">
												<input
													type="checkbox"
													checked={block.gallery.carouselFreeResize === true}
													onChange={(event) =>
														patchGroup({ carouselFreeResize: event.target.checked || undefined })
													}
												/>
												Freeform frame resize
											</label>
											<label className="carousel-ratio-option">
												Frame ratio
												<select
													className="select-input"
													value={carouselRatio}
													onChange={(event) => setCarouselRatio(event.target.value)}
												>
													{carouselRatio === 'custom' && <option value="custom">Custom</option>}
													{CAROUSEL_RATIOS.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</label>
										</div>
										<p className="muted carousel-edit-hint">
											{block.gallery.carouselMoveImage === true
												? block.gallery.carouselFit === 'fill'
													? 'Drag the image in the preview to choose its crop. Use Move carousel to reposition the whole frame.'
													: 'Drag the fitted image within its frame. Use Move carousel to reposition the whole frame.'
												: carouselHostBlock
													? 'Drag anywhere on the image or blue frame to move it on its canvas. Drag the blue corner circle to resize.'
													: 'Drag anywhere on the image or blue frame to move the carousel. Drop it onto a freeform image group to place it there.'}
										</p>
										{carouselHostBlock && (
											<div className="carousel-host-option">
												<span>
													Placed on{' '}
													<strong>
														{carouselHostBlock.type === 'gallery'
															? 'the main image canvas'
															: carouselHostBlock.type === 'images'
																? carouselHostBlock.name || 'another image group'
																: 'another freeform canvas'}
													</strong>
												</span>
												<button
													type="button"
													className="btn-link"
													onClick={() =>
														patchGroup({
															carouselHost: undefined,
															carouselFrame: undefined,
														})
													}
												>
													Return to its own section
												</button>
											</div>
										)}
										<div className="carousel-display-options">
											<label>
												Arrow style
												<select
													className="select-input"
													value={block.gallery.carouselArrowStyle ?? 'chevron'}
													onChange={(event) =>
														patchGroup({
															carouselArrowStyle:
																event.target.value === 'chevron'
																	? undefined
																	: event.target.value as NonNullable<GalleryConfig['carouselArrowStyle']>,
														})
													}
												>
													<option value="chevron">Slim chevrons</option>
													<option value="arrow">Long arrows</option>
													<option value="circle">Circles</option>
													<option value="tab">Edge tabs</option>
												</select>
											</label>
											<label>
												Frame style
												<select
													className="select-input"
													value={block.gallery.carouselFrameStyle ?? 'none'}
													onChange={(event) =>
														patchGroup({
															carouselFrameStyle:
																event.target.value === 'none'
																	? undefined
																	: event.target.value as NonNullable<GalleryConfig['carouselFrameStyle']>,
														})
													}
												>
													<option value="none">No frame</option>
													<option value="line">Fine line</option>
													<option value="shadow">Floating shadow</option>
													<option value="mat">Gallery mat</option>
												</select>
											</label>
											<label className="carousel-chrome-color">
												Chrome color
												<span className="color-field">
													<input
														type="color"
														value={
															/^#[\da-f]{6}$/i.test(block.gallery.carouselChromeColor ?? '')
																? block.gallery.carouselChromeColor
																: /^#[\da-f]{6}$/i.test(doc.content.theme.accentColor)
																	? doc.content.theme.accentColor
																	: '#111111'
														}
														onChange={(event) =>
															patchGroup({ carouselChromeColor: event.target.value })
														}
														aria-label={`Carousel arrow and frame color for ${groupLabel}`}
													/>
													<button
														type="button"
														className="btn-link"
														onClick={() => patchGroup({ carouselChromeColor: undefined })}
													>
														Theme
													</button>
												</span>
											</label>
											<label>
												<input
													type="checkbox"
													checked={block.gallery.carouselShowCount !== false}
													onChange={(event) => patchGroup({ carouselShowCount: event.target.checked ? undefined : false })}
												/>
												Number count
											</label>
											<label>
												<input
													type="checkbox"
													checked={block.gallery.carouselShowTitle === true}
													onChange={(event) => patchGroup({ carouselShowTitle: event.target.checked || undefined })}
												/>
												Image title below
											</label>
										</div>
										{block.gallery.carouselFrame && (
											<button
												type="button"
												className="btn-link carousel-reset-frame"
												onClick={() =>
													patchGroup({
														carouselFrame: undefined,
														carouselFreeResize: undefined,
													})
												}
											>
												Reset carousel size and position
											</button>
										)}
									</div>
								)}
								{!carousel && groupMode === 'grid' && (
									<GridOptions
										config={block.gallery}
										label={groupLabel}
										onPatch={patchGroup}
										onAdopt={() => void adoptGridAsFreeform(block.gallery, patchGroup)}
									/>
								)}
								{!carousel && (phoneItemsFor(block.gallery).length > 0 || block.gallery.mobile) && (
									<MobileArrangementEditor
										items={phoneItemsFor(block.gallery)}
										mobile={block.gallery.mobile}
										gridMode={groupMode === 'grid'}
										label={groupLabel}
										onChange={(mobile) => patchGroup({ mobile })}
									/>
								)}
							</div>
						</details>
						<ImageCollectionEditor
							embedded
							folder={block.gallery.folder}
							variant="gallery"
							addLabel="+ Add image(s)"
							emptyLabel="No images in this group yet."
							requireAltText={false}
							hint={
								carousel
									? 'Images appear one at a time in this order. Visitors use the previous and next controls to click through.'
									: groupMode === 'grid'
									? 'Images auto-arrange into a neat grid — pick columns and crop above. ⠿ here sets the order.'
									: 'A second canvas of its own — drag its images in the preview to arrange them. ⠿ here sets the stacking: the top image sits in front.'
								}
						/>
					</div>
				);
			}
			case 'button': {
				const invalid = !isPageOrWebLink(block.url);
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Button</span>
							{controls(index, block, true)}
						</div>
						<div className="block-field-grid">
							<label className="field">
								<span className="field-label">Words on the button</span>
								<input className="text-input" value={block.label} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { label: event.target.value })} />
							</label>
							<label className="field">
								<span className="field-label">Where it goes</span>
								<input className={`text-input ${invalid ? 'invalid' : ''}`} placeholder="https://… or /work" value={block.url} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { url: event.target.value })} />
								{invalid && <span className="field-error">Add a full web address, or a site page such as /work.</span>}
							</label>
						</div>
						<div className="block-choice-row">
							<label>
								Style
								<select className="select-input" value={block.appearance ?? 'solid'} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { appearance: event.target.value as 'solid' | 'outline' })}>
									<option value="solid">Filled</option>
									<option value="outline">Outline</option>
								</select>
							</label>
							<label>
								Position
								<select className="select-input" value={block.align ?? 'left'} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { align: event.target.value as TextAlign })}>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
								</select>
							</label>
						</div>
					</div>
				);
			}
			case 'divider':
				return (
					<div className="block divider-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Divider</span>
							{controls(index, block, true)}
						</div>
						<div className="block-choice-row">
							<label>
								Style
								<select
									className="select-input"
									value={block.style ?? 'line'}
									onChange={(event) =>
										editor.updateDividerBlock(pageKey, block.id, {
											style:
												event.target.value === 'line'
													? undefined
													: event.target.value as NonNullable<typeof block.style>,
										})
									}
								>
									<option value="line">Single line</option>
									<option value="double">Double line</option>
									<option value="dotted">Dotted</option>
									<option value="ornament">Line + ornament</option>
								</select>
							</label>
							<label>
								Width
								<select
									className="select-input"
									value={block.width ?? 'medium'}
									onChange={(event) =>
										editor.updateDividerBlock(pageKey, block.id, {
											width:
												event.target.value === 'medium'
													? undefined
													: event.target.value as NonNullable<typeof block.width>,
										})
									}
								>
									<option value="short">Short</option>
									<option value="medium">Medium</option>
									<option value="full">Full width</option>
								</select>
							</label>
							<label>
								Color
								<span className="color-field">
									<input
										type="color"
										value={
											/^#[\da-f]{6}$/i.test(block.color ?? '')
												? block.color
												: /^#[\da-f]{6}$/i.test(doc.content.theme.mutedTextColor)
													? doc.content.theme.mutedTextColor
													: '#777777'
										}
										onChange={(event) =>
											editor.updateDividerBlock(pageKey, block.id, {
												color: event.target.value,
											})
										}
										aria-label={`Divider color on ${pageName}`}
									/>
									<button
										type="button"
										className="btn-link"
										onClick={() =>
											editor.updateDividerBlock(pageKey, block.id, {
												color: undefined,
											})
										}
									>
										Theme
									</button>
								</span>
							</label>
						</div>
						<PortfolioDivider
							style={block.style}
							width={block.width}
							color={block.color}
						/>
					</div>
				);
			case 'products': {
				const products = doc.content.store?.products ?? [];
				const selected = block.productIds;
				const selectedSet = new Set(selected ?? []);
				const orderedProducts = selected
					? [
							...selected
								.map((productId) => products.find((product) => product.id === productId))
								.filter((product): product is (typeof products)[number] => !!product),
							...products.filter((product) => !selectedSet.has(product.id)),
						]
					: products;
				const visibleCatalog = products.filter((product) => product.status !== 'draft');
				const productBlockLabel = `products block ${index + 1} on ${pageName}`;
				const toggleProduct = (productId: string, checked: boolean) => {
					const current = selected ?? [];
					editor.updateProductsBlock(pageKey, block.id, {
						productIds: checked
							? [...current, productId]
							: current.filter((id) => id !== productId),
					});
				};
				const moveSelected = (productId: string, direction: -1 | 1) => {
					if (!selected) return;
					const from = selected.indexOf(productId);
					const to = from + direction;
					if (from < 0 || to < 0 || to >= selected.length) return;
					const next = selected.slice();
					const [item] = next.splice(from, 1);
					next.splice(to, 0, item);
					editor.updateProductsBlock(pageKey, block.id, { productIds: next });
				};
				return (
					<div className="block products-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Products shown on this page</span>
							<select
								className="select-input products-layout-select"
								value={block.layout ?? 'grid'}
								aria-label={`Layout for ${productBlockLabel}`}
								onChange={(event) =>
									editor.updateProductsBlock(pageKey, block.id, {
										layout: event.target.value as 'grid' | 'featured',
									})
								}
							>
								<option value="grid">Product grid</option>
								<option value="featured">Featured list</option>
							</select>
							{controls(index, block, true)}
						</div>
						{collectionCanvasControl(block, 'products')}
						{doc.content.store ? (
							<>
								<div className="block-choice-row products-source-choice" role="group" aria-label={`Products shown by ${productBlockLabel}`}>
									<label>
										<input
											type="radio"
											name={`products-source-${block.id}`}
											checked={selected === undefined}
											onChange={() =>
												editor.updateProductsBlock(pageKey, block.id, {
													productIds: undefined,
												})
											}
										/>
										All products
									</label>
									<label>
										<input
											type="radio"
											name={`products-source-${block.id}`}
											checked={selected !== undefined}
											onChange={() =>
												editor.updateProductsBlock(pageKey, block.id, {
													productIds: visibleCatalog.map((product) => product.id),
												})
											}
										/>
										Choose products
									</label>
								</div>
								<p className="muted">
									{selected === undefined
										? 'Shows every non-draft product in Store order, including products you add later.'
										: `Only the ${selected.length} selected product${selected.length === 1 ? '' : 's'} appear on this page. Choose and order them below; drafts stay hidden when published.`}
								</p>
								{selected !== undefined && (
									<div className="products-selection-list">
										{orderedProducts.map((product) => {
											const selectedIndex = selected.indexOf(product.id);
											const checked = selectedIndex >= 0;
											return (
												<div className="products-selection-row" key={product.id}>
													<label>
														<input
															type="checkbox"
															checked={checked}
															onChange={(event) =>
																toggleProduct(product.id, event.target.checked)
															}
														/>
														<span>{product.name || 'Untitled product'}</span>
														{product.status === 'draft' && <small>Draft</small>}
														{product.status === 'sold_out' && <small>Sold out</small>}
													</label>
													{checked && (
														<div className="block-controls" role="group" aria-label={`Order ${product.name || 'untitled product'} in ${productBlockLabel}`}>
															<button
																type="button"
																className="btn-icon"
																disabled={selectedIndex === 0}
																onClick={() => moveSelected(product.id, -1)}
																aria-label={`Move ${product.name || 'untitled product'} earlier in ${productBlockLabel}`}
															>
																↑
															</button>
															<button
																type="button"
																className="btn-icon"
																disabled={selectedIndex === selected.length - 1}
																onClick={() => moveSelected(product.id, 1)}
																aria-label={`Move ${product.name || 'untitled product'} later in ${productBlockLabel}`}
															>
																↓
															</button>
														</div>
													)}
												</div>
											);
										})}
										{products.length === 0 && (
											<p className="muted">Add products in the Store tab, then choose them here.</p>
										)}
									</div>
								)}
							</>
						) : (
							<p className="muted">
								Set up your catalog in{' '}
								<button type="button" className="btn-link" onClick={() => showEditorTab('store')}>
									Store
								</button>{' '}
								before choosing products.
							</p>
						)}
					</div>
				);
			}
			case 'form': {
				const endpointInvalid = !!block.action && (!isUrl(block.action) || !block.action.startsWith('https://'));
				const updateFields = (fields: FormField[]) => editor.updateFormBlock(pageKey, block.id, { fields });
				const formLabel = `contact form ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Contact form</span>
							{controls(index, block, true)}
						</div>
						<Field label="Form heading">
							<TextInput aria-label={`Heading for ${formLabel}`} value={block.heading ?? ''} placeholder="Get in touch" onChange={(event) => editor.updateFormBlock(pageKey, block.id, { heading: event.target.value })} />
						</Field>
						<Field
							label="Optional form service address"
							hint="Leave this blank to use your public contact email from About content. The visitor’s email app opens with their message ready. To send directly instead, paste the form address from a service such as Formspree."
							error={endpointInvalid ? 'Use the https:// form address supplied by your form service.' : undefined}
						>
							<TextInput aria-label={`Optional form service address for ${formLabel}`} value={block.action} placeholder="https://formspree.io/f/…" onChange={(event) => editor.updateFormBlock(pageKey, block.id, { action: event.target.value })} />
						</Field>
						<details className="block-options form-setup-help">
							<summary>Want messages sent without opening email?</summary>
							<ol>
								<li>Create a form with a service such as Formspree.</li>
								<li>Choose the inbox where you want to receive messages.</li>
								<li>Copy the form address it gives you and paste it above.</li>
							</ol>
							<p className="muted">This is optional. Without a form service, visitors can still continue in their email app.</p>
						</details>
						<div className="form-fields-editor">
							<span className="field-label">Questions on the form</span>
							{block.fields.map((field, fieldIndex) => (
								<div className="form-field-row" key={field.id}>
									<input
										className="text-input"
										value={field.label}
										aria-label={`Question ${fieldIndex + 1} label in ${formLabel}`}
										onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))}
									/>
									<select
										className="select-input"
										value={field.type}
										aria-label={`Question ${fieldIndex + 1} answer type in ${formLabel}`}
										onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, type: event.target.value as FormField['type'] } : item))}
									>
										{FORM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
									</select>
									<label className="compact-check"><input type="checkbox" checked={!!field.required} onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, required: event.target.checked || undefined } : item))} /> <span className="sr-only">Require {field.label || `question ${fieldIndex + 1}`} in {formLabel}</span><span aria-hidden="true">Required</span></label>
									<button type="button" className="btn-icon danger" aria-label={`Remove ${field.label || `question ${fieldIndex + 1}`} from ${formLabel}`} onClick={() => updateFields(block.fields.filter((item) => item.id !== field.id))}>✕</button>
								</div>
							))}
							<button type="button" className="btn-link" aria-label={`Add a question to ${formLabel}`} onClick={() => updateFields([...block.fields, { id: uid('field'), type: 'text', label: 'Question' }])}>＋ Add a question</button>
						</div>
						<Field label="Message shown after sending directly">
							<TextInput aria-label={`Message shown after ${formLabel} sends directly`} value={block.successMessage ?? ''} onChange={(event) => editor.updateFormBlock(pageKey, block.id, { successMessage: event.target.value })} />
						</Field>
					</div>
				);
			}
			case 'about':
				return (
					<div className="block about-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label">About content</span>
							{controls(index, block, true)}
						</div>
						<p className="muted about-editor-intro">Everything below appears in this section and updates in the preview as you type.</p>
						<AboutContentEditor />
					</div>
				);
			case 'children':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Sub-pages</span>
							<select
								className="select-input children-style-select"
								value={block.style ?? 'cards'}
								title="How the sub-pages are shown on this page"
								aria-label={`How sub-pages are shown on ${pageName}`}
								onChange={(e) => editor.setChildrenStyle(pageKey, block.id, e.target.value as ChildrenStyle)}
							>
								{CHILDREN_STYLES.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
							{controls(index, block, false)}
						</div>
						{collectionCanvasControl(block, 'sub-pages')}
						{(page.children ?? []).map((childKey, childIndex, childList) => {
							const child = doc.content.pages[childKey];
							const childName = child?.label || childKey;
							const thumbUrl = getAssetPreviewUrl(doc.pageThumbs[childKey]?.assetId ?? null);
							return (
								<div className="child-row" key={childKey}>
									<div className="child-thumb-picker">
										<ImageDrop ariaLabel={`Choose a thumbnail for ${childName}`} onFiles={(files) => editor.setPageThumb(childKey, files[0])}>
											{thumbUrl ? <img className="child-thumb" src={thumbUrl} alt="" /> : <span>＋ Thumb</span>}
										</ImageDrop>
									</div>
									<TextInput
										value={child?.label ?? childKey}
										aria-label={`Name of sub-page ${childName} under ${pageName}`}
										onChange={(e) => editor.renamePage(childKey, e.target.value)}
										placeholder="Sub-page name"
									/>
									<button
										type="button"
										className="btn-icon"
										disabled={childIndex === 0}
										onClick={() => editor.moveChildPage(pageKey, childIndex, childIndex - 1)}
										aria-label={`Move sub-page ${childName} earlier on ${pageName}`}
									>
										↑
									</button>
									<button
										type="button"
										className="btn-icon"
										disabled={childIndex === childList.length - 1}
										onClick={() => editor.moveChildPage(pageKey, childIndex, childIndex + 1)}
										aria-label={`Move sub-page ${childName} later on ${pageName}`}
									>
										↓
									</button>
									<button
										type="button"
										className="btn-icon danger"
										onClick={() => {
											if (confirm(`Delete the “${child?.label ?? childKey}” sub-page?`)) editor.removePage(childKey);
										}}
										aria-label={`Delete sub-page ${childName}`}
									>
										✕
									</button>
								</div>
							);
						})}
						<p className="muted">
							Each sub-page is its own page with images and text — edit them below. ↑↓ sets their order on the page.
							Without a thumbnail, the card uses the sub-page’s first image.
						</p>
					</div>
				);
		}
	};

	const pageDetailsFields = (
		<>
			<Field
				label={nested ? 'Sub-page name' : 'Page name'}
				hint={nested ? 'Shown on its card and heading.' : 'Shown in the site menu.'}
			>
				<TextInput value={page.label ?? ''} onChange={(event) => editor.renamePage(pageKey, event.target.value)} />
			</Field>
			<Field label="Heading (optional)">
				<TextInput
					value={page.heading ?? ''}
					placeholder="Shown at the top of the page"
					onChange={(event) => editor.setPageHeading(pageKey, event.target.value)}
				/>
			</Field>
			<Field
				label="Artwork hanging on this page"
				hint="Inherit the site wall setting, or make just this page hung or perfectly straight."
			>
				<div className="chip-row" role="group" aria-label={`Artwork hanging on ${pageName}`}>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === undefined ? 'active' : ''}`}
						onClick={() => editor.setPageHanging(pageKey, undefined)}
					>
						Use site setting
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === true ? 'active' : ''}`}
						onClick={() => editor.setPageHanging(pageKey, true)}
					>
						Hang this page
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === false ? 'active' : ''}`}
						onClick={() => editor.setPageHanging(pageKey, false)}
					>
						Keep straight
					</button>
				</div>
			</Field>
			{page.heading?.trim() && (
				<Field
					label="Heading motion"
					hint="Animates the page heading when the page opens."
				>
					<div className="heading-kinetic-controls">
						<select
							className="select-input"
							value={page.headingKinetic?.effect ?? ''}
							aria-label={`Heading motion for ${pageName}`}
							onChange={(event) => {
								const effect = event.target.value as KineticTextEffect | '';
								editor.setHeadingKinetic(
									pageKey,
									effect
										? { effect, speed: page.headingKinetic?.speed ?? 100 }
										: undefined,
								);
							}}
						>
							{KINETIC_TEXT_EFFECTS.map((effect) => (
								<option key={effect.value || 'still'} value={effect.value}>
									{effect.label}
								</option>
							))}
						</select>
						{page.headingKinetic && (
							<>
								<label className="motion-range compact">
									<span>Tempo <output>{page.headingKinetic.speed ?? 100}%</output></span>
									<input
										type="range"
										min={50}
										max={200}
										step={5}
										value={page.headingKinetic.speed ?? 100}
										aria-label={`Heading motion tempo for ${pageName}`}
										onChange={(event) =>
											editor.setHeadingKinetic(pageKey, {
												...page.headingKinetic!,
												speed: Number(event.target.value),
											})
										}
									/>
								</label>
								<label className="effect-phone-control">
									<input
										type="checkbox"
										checked={page.headingKinetic.phone !== false}
										onChange={(event) =>
											editor.setHeadingKinetic(pageKey, {
												...page.headingKinetic!,
												phone: event.target.checked ? undefined : false,
											})
										}
									/>
									Use on phones
								</label>
								<button
									type="button"
									className="btn-secondary kinetic-preview-button"
									onClick={() => previewTypeMotion(pageKey, 'page:heading')}
								>
									▶ Preview motion
								</button>
							</>
						)}
					</div>
				</Field>
			)}
			<div className="project-template-editor">
				<label className="field">
					<span className="field-label">Project fields</span>
					<select
						className="select-input"
						value={page.project?.template ?? ''}
						aria-label={`Project field template for ${pageName}`}
						onChange={(event) => {
							const template = event.target.value as ProjectTemplate | '';
							editor.setProjectDetails(
								pageKey,
								template
									? { ...page.project, template }
									: undefined,
							);
						}}
					>
						<option value="">Not a project page</option>
						<option value="artwork">Artwork — year, medium, dimensions</option>
						<option value="collaboration">Collaboration — add collaborators</option>
						<option value="exhibition">Exhibition — add exhibition history</option>
					</select>
					<span className="field-hint">Structured facts stay consistent across project pages.</span>
				</label>
				{page.project && (
					<div className="project-field-grid">
						{([
							['year', 'Year', '2026'],
							['medium', 'Medium', 'Oil on canvas'],
							['dimensions', 'Dimensions', '120 × 90 cm'],
							['collaborators', 'Collaborators', 'Names and roles'],
							['exhibitionHistory', 'Exhibition history', 'Venue, city, year'],
						] as const).map(([key, label, placeholder]) => (
							<label className={key === 'exhibitionHistory' ? 'wide' : ''} key={key}>
								<span>{label}</span>
								{key === 'exhibitionHistory' ? (
									<textarea
										className="text-area"
										rows={3}
										placeholder={placeholder}
										value={page.project?.[key] ?? ''}
										onChange={(event) =>
											editor.setProjectDetails(pageKey, {
												...page.project!,
												[key]: event.target.value || undefined,
											})
										}
									/>
								) : (
									<input
										className="text-input"
										placeholder={placeholder}
										value={page.project?.[key] ?? ''}
										onChange={(event) =>
											editor.setProjectDetails(pageKey, {
												...page.project!,
												[key]: event.target.value || undefined,
											})
										}
									/>
								)}
							</label>
						))}
					</div>
				)}
			</div>
		</>
	);

	return (
		<Section
			sectionKey={pageKey}
			defaultCollapsed={nested && includeChildren}
			title={nested ? `↳ ${page.label ?? pageKey}` : isHome ? `Page: ${page.label || 'Home'}` : `Page: ${page.label ?? pageKey}`}
		>
			{hasAboutBlock ? (
				<details className="page-settings-disclosure">
					<summary>
						<span>
							<strong>Page settings</strong>
							<small>Name and heading</small>
						</span>
						<span className="page-editor-advanced-chevron" aria-hidden="true">⌄</span>
					</summary>
					<div className="page-settings-body">{pageDetailsFields}</div>
				</details>
			) : (
				<div className="page-editor-group page-details-group">
					<h3>Page details</h3>
					{pageDetailsFields}
				</div>
			)}

			<div
				className="page-editor-group page-content-group"
				ref={pageContentRef}
				data-tour="page-sections"
			>
				<div className="page-content-heading">
					<h3>Content</h3>
					<details className="page-add-block" ref={addMenuRef} data-tour="add-block">
						<summary className="btn-primary" aria-label={`Add a block to ${pageName}`}>
							＋ Add block
						</summary>
						<div className="page-add-block-menu">
							{addBlockMenuItems()}
						</div>
					</details>
				</div>
				{(doc.content.sectionLibrary?.length ?? 0) > 0 && (
					<section
						className={`section-library${itemIsCollapsed('saved-blocks', 'library') ? ' is-collapsed' : ''}`}
						aria-labelledby={`saved-sections-${pageKey.replace(/\W/g, '-')}`}
					>
						<header>
							<button
								type="button"
								className="section-library-toggle"
								aria-expanded={!itemIsCollapsed('saved-blocks', 'library')}
								onClick={() => toggleEditorItem('saved-blocks', 'library')}
							>
								<span className="editor-collapse-chevron" aria-hidden="true">
									{itemIsCollapsed('saved-blocks', 'library') ? '▸' : '▾'}
								</span>
								<span>
									<strong id={`saved-sections-${pageKey.replace(/\W/g, '-')}`}>Saved blocks</strong>
									<small>Recall a block into any existing section or start a new section with it.</small>
								</span>
							</button>
							<span className="count">{doc.content.sectionLibrary?.length}</span>
						</header>
						{!itemIsCollapsed('saved-blocks', 'library') && <div className="section-library-list">
							{doc.content.sectionLibrary!.map((template) => (
								<div className="section-library-row" key={template.id}>
									<span>
										<strong>{template.name}</strong>
										<small>{template.motion ? `${template.motion.effect} motion available for a new section` : 'Reusable block'}</small>
									</span>
									<button
										type="button"
										className="btn-primary"
										onClick={() =>
											runSectionAdd(
												(target) =>
													editor.insertSectionTemplate(pageKey, template.id, target),
												undefined,
												template.name,
											)
										}
									>
										Add block…
									</button>
									<button
										type="button"
										className="btn-icon danger"
										aria-label={`Delete saved block ${template.name}`}
										onClick={() => editor.removeSectionTemplate(template.id)}
									>
										✕
									</button>
								</div>
							))}
						</div>}
					</section>
				)}
				<div className="page-section-list">
					{sections.map((section, sectionIndex) => {
						const accent = sectionEditorColor(section, sectionIndex);
						const partKey = sectionPartKey(section.id);
						const sectionCollapsed = itemIsCollapsed('section', section.id);
						return (
							<section
								className={`page-section-editor${sectionCollapsed ? ' is-collapsed' : ''}`}
								key={section.id}
								data-editor-section={section.id}
								style={{ '--section-editor-color': accent } as CSSProperties}
							>
									<div className="page-section-editor-head">
										<button
											type="button"
											className="page-section-collapse-toggle"
											aria-expanded={!sectionCollapsed}
											onClick={() => toggleEditorItem('section', section.id)}
											aria-label={`${sectionCollapsed ? 'Expand' : 'Collapse'} Section ${sectionIndex + 1}, ${section.name}`}
										>
											<span className="page-section-number" aria-hidden="true">
												{sectionIndex + 1}
											</span>
											<span className="page-section-collapse-chevron" aria-hidden="true">
												{sectionCollapsed ? '▸' : '▾'}
											</span>
										</button>
										<span className="page-section-title">
											<small>Section {sectionIndex + 1}</small>
											<input
												key={`${section.id}:${section.name}`}
												className="section-name-input"
												aria-label={`Name for Section ${sectionIndex + 1}`}
												defaultValue={section.name}
												onBlur={(event) => {
													const name = event.target.value.trim();
													if (name && name !== section.name)
														editor.renameSection(pageKey, section.id, name);
													else event.target.value = section.name;
												}}
												onKeyDown={(event) => {
													if (event.key === 'Enter') event.currentTarget.blur();
													if (event.key === 'Escape') {
														event.currentTarget.value = section.name;
														event.currentTarget.blur();
													}
												}}
											/>
											<small>
												{section.blockIds.length} block{section.blockIds.length === 1 ? '' : 's'}
											</small>
										</span>
										<div className="page-section-actions">
											<label
												className="section-label-color"
												title={`Editor label color for ${section.name}`}
											>
												<span className="sr-only">Editor label color for {section.name}</span>
												<input
													type="color"
													value={accent}
													onChange={(event) =>
														editor.setSectionEditorColor(
															pageKey,
															section.id,
															event.target.value,
														)
													}
												/>
											</label>
											<ColorSwatchPicker
												label={`Published background color for Section ${sectionIndex + 1}, ${section.name}`}
												value={page.sectionColors?.[partKey]}
												themeColors={themeColors}
												onChange={(color) =>
													editor.setSectionColor(pageKey, partKey, color)
												}
											/>
											<button
												type="button"
												className="btn-icon"
												disabled={sectionIndex === 0}
												onClick={() =>
													editor.moveSection(pageKey, sectionIndex, sectionIndex - 1)
												}
												aria-label={`Move Section ${sectionIndex + 1} earlier`}
											>
												↑
											</button>
											<button
												type="button"
												className="btn-icon"
												disabled={sectionIndex === sections.length - 1}
												onClick={() =>
													editor.moveSection(pageKey, sectionIndex, sectionIndex + 1)
												}
												aria-label={`Move Section ${sectionIndex + 1} later`}
											>
												↓
											</button>
											<details className="page-add-block section-add-block">
												<summary
													className="btn-secondary"
													aria-label={`Add a block to Section ${sectionIndex + 1}, ${section.name}`}
												>
													＋ Add block
												</summary>
												<div className="page-add-block-menu">
													{addBlockMenuItems(section.id)}
												</div>
											</details>
										</div>
									</div>
								{!sectionCollapsed && <div className="page-section-editor-blocks">
									{section.blockIds.map((blockId) => {
										const block = blockById.get(blockId);
										if (!block) return null;
										const index = blocks.findIndex(
											(candidate) => candidate.id === blockId,
										);
										return (
											<div
												key={block.id}
												data-editor-block={block.id}
												className={itemIsCollapsed('block', block.id) ? 'is-collapsed' : undefined}
											>
												{renderBlock(block, index)}
											</div>
										);
									})}
									{section.blockIds.length === 0 && (
										<p className="empty-section-note">
											This is your Main section. Add any block here to start.
										</p>
									)}
								</div>}
							</section>
						);
					})}
				</div>
			</div>
			{!nested && (
				<details className="page-add-block floating-add-block" ref={floatingAddMenuRef}>
					<summary className="floating-add-button" aria-label={`Add a block to ${pageName}`} title="Add block">
						<span aria-hidden="true">＋</span>
						<strong>Add block</strong>
					</summary>
					<div className="page-add-block-menu">
						{addBlockMenuItems()}
					</div>
				</details>
			)}

			<details className="page-editor-advanced">
				<summary>
					<span>
						<strong>Mobile &amp; advanced</strong>
						<small>Scroll scenes, page colors and phone arrangement</small>
					</span>
					<span className="page-editor-advanced-chevron" aria-hidden="true">⌄</span>
				</summary>
				<div className="page-editor-advanced-body">
					<div className="copy-effects-panel">
						<span>
							<strong>Page effects</strong>
							<small>Copy scroll scenes and kinetic type to another page.</small>
						</span>
						<div>
							<button
								type="button"
								className="btn-secondary"
								onClick={() => writeEffectClipboard({ kind: 'page', page })}
							>
								Copy effects
							</button>
							<button
								type="button"
								className="btn-secondary"
								onClick={() => {
									const copied = readEffectClipboard();
									if (copied?.kind === 'page') editor.applyPageEffects(pageKey, copied.page);
									else alert('Copy effects from a page first.');
								}}
							>
								Paste effects
							</button>
						</div>
					</div>
					<Field
						label="Scroll scenes"
						hint="Choose how each section responds as visitors move through the page. Motion stays off on phones unless you opt in."
					>
						<div className="scroll-scene-list">
							{motionSectionItems.map((item) => {
								const motion = page.sectionMotion?.[item.key];
								return (
									<div className="scroll-scene-row" key={item.key}>
										<div className="scroll-scene-heading">
											<strong>{item.label}</strong>
											<select
												className="select-input"
												value={motion?.effect ?? ''}
												aria-label={`Scroll scene for ${item.label}`}
												onChange={(event) => {
													const effect = event.target.value as SectionMotionEffect | '';
													editor.setSectionMotion(
														pageKey,
														item.key,
														effect
															? {
																	effect,
																	intensity: motion?.intensity ?? 45,
																	phone: motion?.phone,
																}
															: undefined,
													);
												}}
											>
												{SECTION_MOTION_EFFECTS.map((effect) => (
													<option key={effect.value || 'still'} value={effect.value}>
														{effect.label}
													</option>
												))}
											</select>
										</div>
										{motion && (
											<div className="scroll-scene-options">
												<label className="motion-range compact">
													<span>Strength <output>{motion.intensity ?? 45}%</output></span>
													<input
														type="range"
														min={1}
														max={100}
														step={1}
														value={motion.intensity ?? 45}
														onChange={(event) =>
															editor.setSectionMotion(pageKey, item.key, {
																...motion,
																intensity: Number(event.target.value),
															})
														}
													/>
												</label>
												<label className="compact-check">
													<input
														type="checkbox"
														checked={motion.phone ?? false}
														onChange={(event) =>
															editor.setSectionMotion(pageKey, item.key, {
																...motion,
																phone: event.target.checked || undefined,
															})
														}
													/>
													Use on phones
												</label>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</Field>

					<Field
						label="Background colors"
						hint="Color the whole page or the heading band here. Each numbered section has its own background picker in Content."
					>
						<div className="color-surface-controls">
							<div className="color-surface-control">
								<span className="color-surface-copy">
									<strong>Whole page</strong>
									<small>Behind every section on {pageName}</small>
								</span>
								<div className="color-surface-action">
									<ColorSwatchPicker
										label={`Whole-page background color for ${pageName}`}
										value={page.background}
										themeColors={themeColors}
										onChange={(color) => editor.setPageBackground(pageKey, color)}
									/>
									<span>{page.background ?? 'Uses site background'}</span>
								</div>
							</div>
							{page.heading?.trim() && (
								<div className="color-surface-control">
									<span className="color-surface-copy">
										<strong>Heading band</strong>
										<small>Only behind the page heading</small>
									</span>
									<div className="color-surface-action">
										<ColorSwatchPicker
											label={`Heading-band background color for ${pageName}`}
											value={page.sectionColors?.['page:heading']}
											themeColors={themeColors}
											onChange={(color) => editor.setSectionColor(pageKey, 'page:heading', color)}
										/>
										<span>{page.sectionColors?.['page:heading'] ?? 'No separate band'}</span>
									</div>
								</div>
							)}
						</div>
					</Field>

					{(pagePhoneItems.length > 0 || page.mobile) && (
						<MobileArrangementEditor
							items={pagePhoneItems}
							mobile={page.mobile}
							simple
							scope="page"
							label={pageName}
							onChange={(mobile) => editor.setPageMobile(pageKey, mobile)}
						/>
					)}
				</div>
			</details>

			{pendingSectionAdd && (
				<Modal
					title={`Add ${pendingSectionAdd.label}`}
					onClose={() => setPendingSectionAdd(null)}
				>
					<p className="section-destination-intro">
						Choose the section where this block should appear.
					</p>
					<div className="section-destination-list">
						<button
							type="button"
							className="section-destination-option section-destination-new"
							aria-label={`Add ${pendingSectionAdd.label} to a new section`}
							onClick={() => {
								const action = pendingSectionAdd.action;
								setPendingSectionAdd(null);
								performSectionAdd(action, NEW_SECTION_ID);
							}}
						>
							<span className="page-section-number" aria-hidden="true">＋</span>
							<span>
								<strong>New section</strong>
								<small>Create it at the bottom of this page</small>
							</span>
							<span aria-hidden="true">→</span>
						</button>
						{sections.map((section, sectionIndex) => {
							const accent = sectionEditorColor(section, sectionIndex);
							return (
								<button
									type="button"
									className="section-destination-option"
									key={section.id}
									style={{ '--section-editor-color': accent } as CSSProperties}
									aria-label={`Add ${pendingSectionAdd.label} to Section ${sectionIndex + 1}, ${section.name}`}
									onClick={() => {
										const action = pendingSectionAdd.action;
										setPendingSectionAdd(null);
										performSectionAdd(action, section.id);
									}}
								>
									<span className="page-section-number" aria-hidden="true">
										{sectionIndex + 1}
									</span>
									<span>
										<strong>{section.name}</strong>
										<small>
											{section.blockIds.length} block
											{section.blockIds.length === 1 ? '' : 's'}
										</small>
									</span>
									<span aria-hidden="true">→</span>
								</button>
							);
						})}
					</div>
				</Modal>
			)}

			{pendingSectionMove && (
				<Modal
					title={`Move ${pendingSectionMove.label}`}
					onClose={() => setPendingSectionMove(null)}
				>
					<p className="section-destination-intro">
						Choose where this block should live.
					</p>
					<div className="section-destination-list">
						<button
							type="button"
							className="section-destination-option section-destination-new"
							aria-label={`Move ${pendingSectionMove.label} to a new section`}
							onClick={() => {
								editor.moveBlockToSection(
									pageKey,
									pendingSectionMove.blockId,
									NEW_SECTION_ID,
								);
								setPendingSectionMove(null);
							}}
						>
							<span className="page-section-number" aria-hidden="true">＋</span>
							<span>
								<strong>New section</strong>
								<small>Place it directly after its current section</small>
							</span>
							<span aria-hidden="true">→</span>
						</button>
						{sections
							.filter(
								(section) => section.id !== pendingSectionMove.sourceSectionId,
							)
							.map((section) => {
								const sectionIndex = sections.findIndex(
									(candidate) => candidate.id === section.id,
								);
								const accent = sectionEditorColor(section, sectionIndex);
								return (
									<button
										type="button"
										className="section-destination-option"
										key={section.id}
										style={{ '--section-editor-color': accent } as CSSProperties}
										aria-label={`Move ${pendingSectionMove.label} to Section ${sectionIndex + 1}, ${section.name}`}
										onClick={() => {
											editor.moveBlockToSection(
												pageKey,
												pendingSectionMove.blockId,
												section.id,
											);
											setPendingSectionMove(null);
										}}
									>
										<span className="page-section-number" aria-hidden="true">
											{sectionIndex + 1}
										</span>
										<span>
											<strong>{section.name}</strong>
											<small>
												{section.blockIds.length} block
												{section.blockIds.length === 1 ? '' : 's'}
											</small>
										</span>
										<span aria-hidden="true">→</span>
									</button>
								);
							})}
					</div>
				</Modal>
			)}

			{includeChildren && !nested && (page.children?.length ?? 0) > 0 && (
				<div className="nested-pages">
					{page.children!.map((childKey) => (
						<PageEditor key={childKey} pageKey={childKey} nested />
					))}
				</div>
			)}
		</Section>
	);
}
