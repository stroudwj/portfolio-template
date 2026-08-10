// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useEditor } from '../store';
import {
	Field,
	HelpDisclosure,
	HelpTip,
	TextInput,
	Section,
	previewTypeMotion,
	onSelectPreviewBlock,
	onRevealEditorSection,
	showEditorTab,
} from './ui/controls';
import { ColorSwatchPicker } from './ui/ColorSwatchPicker';
import {
	SECTION_MOTION_CHOICES,
	SectionMotionPicker,
	nextSectionMotion,
} from './ui/SectionMotionPicker';
import { PanelIcon } from './ui/panel-icons';
import ImageCollectionEditor from './ImageCollectionEditor';
import MobileArrangementEditor, { type MobileArrangementItem } from './MobileArrangementEditor';
import { ImageDrop } from './ui/ImageDrop';
import { BlockIcon } from './ui/block-icons';
import { getAssetPreviewUrl, uid } from '../lib/assets';
import {
	embedKindForInput,
	embedKindLabel,
	embedSpec,
	type EmbedKind,
} from '../../portfolio/mediaEmbed';
import { stripePaymentLink } from '../../portfolio/paymentEmbed';
import { DEFAULT_CAROUSEL_FRAME, parseAspect, uniformColumns } from '../../portfolio/Gallery';
import { gridGap, smartGridLayouts } from '../../portfolio/smartGrid';
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
	DEFAULT_CONTACT_BUTTON_LABEL,
	decodeContactEmail,
	encodeContactEmail,
	type ContactEmailParts,
} from '../../portfolio/contactEmail';
import {
	isEmail,
	isUrl,
	isVideoFile,
	MAX_VIDEO_BYTES,
	MAX_VIDEO_MB,
} from '../lib/validation';
import { fontOptionsForTheme } from '../lib/font-options';
import type {
	ChildrenStyle,
	ChildPageItem,
	FormField,
	GalleryConfig,
	KineticTextEffect,
	PageBlock,
	ProjectTemplate,
	ProjectFieldKey,
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
	sectionForBlock as sectionForBlockIn,
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
const AUTO_SCROLL_SELECTED_STORE = 'portfolio-editor-auto-scroll-selected';

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

const BLOCK_TYPE_OPTIONS: Array<{ value: PageBlock['type']; label: string }> = [
	{ value: 'text', label: 'Text' },
	{ value: 'gallery', label: 'Main gallery' },
	{ value: 'images', label: 'Image group' },
	{ value: 'embed', label: 'Video / audio / map' },
	{ value: 'shots', label: 'Shots / scroll video' },
	{ value: 'button', label: 'Button' },
	{ value: 'divider', label: 'Divider' },
	{ value: 'children', label: 'Sub-pages' },
	{ value: 'about', label: 'About content' },
	{ value: 'contact', label: 'Email button' },
	{ value: 'form', label: 'Contact form' },
	{ value: 'accordion', label: 'Accordion' },
	{ value: 'shape', label: 'Shape' },
	{ value: 'products', label: 'Products' },
	{ value: 'project', label: 'Project fields' },
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

function CarouselCustomRatioInputs({
	aspect,
	onChange,
}: {
	aspect: number;
	onChange: (aspect: number) => void;
}) {
	const [width, setWidth] = useState(String(Math.round(aspect * 100) / 100));
	const [height, setHeight] = useState('1');

	useEffect(() => {
		setWidth(String(Math.round(aspect * 100) / 100));
		setHeight('1');
	}, [aspect]);

	const commit = () => {
		const nextWidth = Number(width);
		const nextHeight = Number(height);
		if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
			setWidth(String(Math.round(aspect * 100) / 100));
			setHeight('1');
			return;
		}
		onChange(nextWidth / nextHeight);
	};

	const enterToCommit = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') event.currentTarget.blur();
	};

	return (
		<div className="carousel-custom-ratio" role="group" aria-label="Custom carousel frame ratio">
			<label>
				W
				<input className="text-input compact-number" type="text" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} onBlur={commit} onKeyDown={enterToCommit} aria-label="Custom carousel ratio width" />
			</label>
			<span aria-hidden="true">:</span>
			<label>
				H
				<input className="text-input compact-number" type="text" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={commit} onKeyDown={enterToCommit} aria-label="Custom carousel ratio height" />
			</label>
		</div>
	);
}

/**
 * Shared by any block that stores an address split and encoded (the contact
 * block's public address, the form block's private delivery inbox): the field
 * keeps the artist's plain typing in local state and commits the encoded halves
 * only once the address is complete. A half-typed address commits as empty
 * rather than shipping a broken mailto to the published site.
 */
function ContactEmailField({
	email,
	ariaLabel,
	onChange,
	label = 'Email address',
	hint = 'Shown on the page as “name [at] example [dot] com” so address harvesters can’t read it. The button opens the visitor’s email app.',
}: {
	email: ContactEmailParts | undefined;
	ariaLabel: string;
	onChange: (email: ContactEmailParts) => void;
	label?: string;
	hint?: string;
}) {
	const stored = decodeContactEmail(email);
	const [typed, setTyped] = useState(stored);

	// Undo/redo and switching pages replace the block under the field.
	useEffect(() => {
		setTyped(stored);
	}, [stored]);

	const invalid = !!typed.trim() && !isEmail(typed);

	return (
		<Field label={label} hint={hint} error={invalid ? 'Enter a valid email address.' : undefined}>
			<TextInput
				aria-label={ariaLabel}
				value={typed}
				placeholder="you@example.com"
				onChange={(event) => {
					const next = event.target.value;
					setTyped(next);
					onChange(encodeContactEmail(next));
				}}
			/>
		</Field>
	);
}

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
		| 'smartGrid'
		| 'galleryWall'
		| 'gapX'
		| 'gapY'
		| 'carousel'
		| 'carouselFit'
		| 'carouselFrame'
		| 'carouselFreeResize'
		| 'carouselCustomRatio'
		| 'carouselMoveImage'
		| 'carouselHost'
		| 'carouselShowCount'
		| 'carouselShowTitle'
		| 'carouselRequireAlt'
		| 'carouselArrowStyle'
		| 'carouselFrameStyle'
		| 'carouselChromeColor'
		| 'carouselArrowColor'
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

/** Layout toggle shared by the main gallery block and extra image groups.
 *  A gallery choosing Grid for the first time gets the smart grid by default;
 *  docs that were already grids keep their uniform look until toggled. */
function LayoutToggle({
	mode,
	config,
	onPatch,
	label,
	carousel = false,
}: {
	mode: 'freeform' | 'grid' | 'carousel';
	config: GalleryConfig;
	onPatch: (patch: GalleryPatch) => void;
	label: string;
	carousel?: boolean;
}) {
	const gridPatch: GalleryPatch =
		mode !== 'grid' && config.smartGrid === undefined
			? { layout: 'grid', carousel: undefined, smartGrid: true }
			: { layout: 'grid', carousel: undefined };
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
				onClick={() => onPatch(gridPatch)}
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

/** Grid-mode settings (smart grid, columns, crop, gaps) shared by the gallery
 *  block and image groups. */
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
	const smart = config.smartGrid === true;
	return (
		<div className="grid-options">
			<label className="grid-option">
				<input
					type="checkbox"
					checked={smart}
					aria-label={`Smart grid for ${label}`}
					onChange={(e) => onPatch({ smartGrid: e.target.checked })}
				/>
				Smart grid
			</label>
			<HelpTip tip="Packs horizontal and vertical pieces together using each artwork's own shape — no forced crops. Off returns to the classic uniform grid." />
			{smart && (
				<>
					<label className="grid-option">
						<input
							type="checkbox"
							checked={config.galleryWall === true}
							aria-label={`Gallery wall variety for ${label}`}
							onChange={(e) => onPatch({ galleryWall: e.target.checked || undefined })}
						/>
						Gallery wall
					</label>
					<HelpTip tip="Gently varies each artwork's size and placement so the grid hangs like a gallery wall instead of lining up like a spreadsheet. The variation is stable — publishing shows exactly what you see here." />
				</>
			)}
			<label className="grid-option">
				Columns
				<select
					className="select-input"
					aria-label={`Number of columns for ${label}`}
					title={smart ? 'About how many pieces share a row' : undefined}
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
			{!smart && (
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
			)}
			<label className="grid-option grid-gap-option">
				Gap ↔
				<input
					type="range"
					min={0}
					max={4}
					step={0.25}
					value={gridGap(config.gapX)}
					aria-label={`Horizontal space between images for ${label}`}
					onChange={(e) => onPatch({ gapX: Number(e.target.value) })}
				/>
			</label>
			<label className="grid-option grid-gap-option">
				Gap ↕
				<input
					type="range"
					min={0}
					max={4}
					step={0.25}
					value={gridGap(config.gapY)}
					aria-label={`Vertical space between rows for ${label}`}
					onChange={(e) => onPatch({ gapY: Number(e.target.value) })}
				/>
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

/** One-click actions over every image in a group — arranging a 25–50 image
 *  page shouldn't need per-image fiddling. Each action is a single document
 *  commit, so one Cmd+Z restores the previous arrangement. */
function BatchImageTools({ folder, label, gridMode }: { folder: string; label: string; gridMode: boolean }) {
	const editor = useEditor();
	const [cropAspect, setCropAspect] = useState('1:1');
	const [cropZoom, setCropZoom] = useState(1);
	const count = editor.doc?.galleries[folder]?.length ?? 0;
	if (count < 2) return null;
	return (
		<div className="batch-tools">
			<span className="batch-tools-title">
				All {count} images
				<HelpTip tip="Whole-group shortcuts for arranging many images at once. Every action here is one undo step — Cmd+Z brings the previous arrangement straight back." />
			</span>
			<div className="batch-tools-row">
				<button
					type="button"
					className="btn-icon btn-chip"
					title="Deal the images into a new random order"
					onClick={() => editor.shuffleGalleryImages(folder)}
				>
					Shuffle order
				</button>
				<button
					type="button"
					className="btn-icon btn-chip"
					title="Remove every image's crop and zoom so each shows at its own shape"
					onClick={() => editor.resetGalleryCrops(folder)}
				>
					Reset all crops
				</button>
				<button
					type="button"
					className="btn-icon btn-chip"
					title="Reset every image's artwork effects (hanging, mount, hover, arrival) and crops to the page defaults"
					onClick={() => {
						if (
							confirm(
								`Reset artwork effects and crops on all ${count} images in ${label}? Titles, captions, and light adjustments stay.`,
							)
						)
							editor.clearGalleryImageSettings(folder);
					}}
				>
					Clear image settings…
				</button>
			</div>
			{gridMode && (
				<details className="batch-crop">
					<summary>Crop &amp; zoom all…</summary>
					<div className="batch-crop-body">
						<label className="grid-option">
							Frame
							<select
								className="select-input"
								aria-label={`Crop frame for every image in ${label}`}
								value={cropAspect}
								onChange={(e) => setCropAspect(e.target.value)}
							>
								{CROP_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
						<label className="grid-option batch-crop-zoom">
							Zoom <output>{cropZoom.toFixed(2)}×</output>
							<input
								type="range"
								min={1}
								max={6}
								step={0.05}
								value={cropZoom}
								aria-label={`Zoom for every image in ${label}`}
								onChange={(e) => setCropZoom(Number(e.target.value))}
							/>
						</label>
						<button
							type="button"
							className="btn-icon btn-chip"
							title="Give every image in this group this frame and zoom — then nudge individual images from their own crop controls"
							onClick={() => editor.applyGalleryCropAll(folder, cropAspect || undefined, cropZoom)}
						>
							Apply to all {count}
						</button>
					</div>
				</details>
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
	/** Latest editor for long-lived event subscriptions (they outlive renders). */
	const editorRef = useRef(editor);
	editorRef.current = editor;
	const addMenuRef = useRef<HTMLDetailsElement>(null);
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
	const [newSubpageName, setNewSubpageName] = useState<string | null>(null);
	const [pendingSubpage, setPendingSubpage] = useState<{
		parentKey: string;
		sectionId?: string;
	} | null>(null);
	const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
	const [autoScrollSelected, setAutoScrollSelected] = useState(() =>
		typeof localStorage === 'undefined'
			? true
			: localStorage.getItem(AUTO_SCROLL_SELECTED_STORE) !== 'false',
	);
	const [collapsedEditorItems, setCollapsedEditorItems] = useState<
		Record<string, boolean>
	>(loadPageItemCollapse);
	const collapseItemKey = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) => `${pageKey}:${kind}:${id}`;
	// Blocks AND sections rest collapsed so the column reads as the page's
	// structure; the preview's floating controls (or a row click) open the one
	// being worked on.
	const itemIsCollapsed = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) =>
		collapsedEditorItems[collapseItemKey(kind, id)] ??
		(kind === 'block' || kind === 'section');
	const toggleEditorItem = (
		kind: 'saved-blocks' | 'section' | 'block',
		id: string,
	) => {
		const key = collapseItemKey(kind, id);
		setCollapsedEditorItems((current) => {
			const collapsed = !(current[key] ?? (kind === 'block' || kind === 'section'));
			storePageItemCollapse(key, collapsed);
			return { ...current, [key]: collapsed };
		});
	};
	const expandEditorBlock = (blockId: string) => {
		const key = collapseItemKey('block', blockId);
		storePageItemCollapse(key, false);
		setCollapsedEditorItems((current) => ({ ...current, [key]: false }));
	};
	useEffect(
		() =>
			onSelectPreviewBlock((selection) => {
				if (selection.pageKey !== pageKey) return;
				setSelectedBlockId(selection.blockId);
				setCollapsedEditorItems((current) => {
					const blockKey = collapseItemKey('block', selection.blockId);
					const next = { ...current, [blockKey]: false };
					storePageItemCollapse(blockKey, false);
					// The block card only renders inside an open section — reveal
					// its section in the same pass.
					const selectedPage = editorRef.current.doc?.content.pages[pageKey];
					const owner = selectedPage
						? sectionForBlockIn(selectedPage, selection.blockId)
						: undefined;
					if (owner) {
						const sectionKey = collapseItemKey('section', owner.id);
						next[sectionKey] = false;
						storePageItemCollapse(sectionKey, false);
					}
					return next;
				});
				if (!autoScrollSelected) return;
				requestAnimationFrame(() => {
					const target = pageContentRef.current
						?.querySelector<HTMLElement>(`[data-editor-block="${CSS.escape(selection.blockId)}"]`);
					const scroller = target?.closest<HTMLElement>('.editor-controls');
					if (!target || !scroller) return;
					const targetTop = target.getBoundingClientRect().top
						- scroller.getBoundingClientRect().top
						+ scroller.scrollTop;
					// Keep the selected block just beneath the sticky editor tabs. Centering
					// tall blocks made carousel selection jump a little too far down.
					scroller.scrollTo({
						top: Math.max(0, targetTop - 72),
						behavior: 'smooth',
					});
				});
			}),
		[autoScrollSelected, pageKey],
	);
	// The preview's floating "Edit section" lands on the section's card here.
	useEffect(
		() =>
			onRevealEditorSection((reveal) => {
				if (reveal.pageKey !== pageKey) return;
				const key = collapseItemKey('section', reveal.sectionId);
				storePageItemCollapse(key, false);
				setCollapsedEditorItems((current) => ({ ...current, [key]: false }));
				requestAnimationFrame(() => {
					pageContentRef.current
						?.querySelector<HTMLElement>(
							`[data-editor-section="${CSS.escape(reveal.sectionId)}"]`,
						)
						?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				});
			}),
		[pageKey],
	);
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const pageName = page.label || (isHome ? 'Home' : pageKey);
	const siteHanging = doc.content.site.creative?.looseHang === true;
	const siteHangingStrength = doc.content.site.creative?.hangStrength ?? 0.75;
	const pageHangingStrength = page.hangingStrength ?? siteHangingStrength;
	const parentPageEntry = Object.entries(doc.content.pages).find(([, candidate]) =>
		(candidate.children ?? []).includes(pageKey),
	);
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

	const addChild = (parentKey = pageKey, sectionId?: string) => {
		setPendingSubpage({ parentKey, sectionId });
		setNewSubpageName('');
	};
	const runAdd = (action: () => void, scrollToNewBlock = true) => {
		const before = new Set(blocks.map((block) => block.id));
		addMenuRef.current?.removeAttribute('open');
		action();
		if (!scrollToNewBlock) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const added = Array.from(
					pageContentRef.current?.querySelectorAll<HTMLElement>('[data-editor-block]') ?? [],
				).find((element) => !before.has(element.dataset.editorBlock ?? ''));
				// New blocks open ready to edit even though blocks rest collapsed.
				if (added?.dataset.editorBlock) expandEditorBlock(added.dataset.editorBlock);
				added?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}),
		);
	};

	const closeBlockMenus = () => {
		addMenuRef.current?.removeAttribute('open');
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
	) => {
		const owner = sectionForBlock(block.id);
		const canvasSection = owner ? sectionHasFreeCanvas(owner.id) : false;
		// Inside a freeform-canvas section the block lives ON the canvas — page
		// flow there renders below the art, so no return toggle is offered. Use
		// "Move to another section" to take it off the canvas entirely.
		if (block.canvasLayout && canvasSection)
			return (
				<div className="collection-canvas-control active">
					<span>
						<strong>On the freeform canvas</strong>
						<small>
							Drag or resize the complete {label} block in the preview. Move it to
							another section to take it off this canvas.
						</small>
					</span>
				</div>
			);
		return (
			<div className={`collection-canvas-control${block.canvasLayout ? ' active' : ''}`}>
				<span>
					<strong>{block.canvasLayout ? 'Freeform canvas placement' : 'Page flow placement'}</strong>
					<small>
						{block.canvasLayout
							? `Drag or resize the complete ${label} block in the preview.`
							: canvasSection
								? `This section is a freeform canvas — put the ${label} block on it so the cards sit below your art instead of over it.`
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
	};

	const addBlockMenuItems = (sectionId?: string) => (
		<>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addTextBlock(pageKey, target), sectionId, 'text')}><BlockIcon type="text" />Text</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addImagesBlock(pageKey, target), sectionId, 'image group')}><BlockIcon type="images" />Image group</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'video', target), sectionId, 'video')}><BlockIcon type="video" />Video</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addShotsBlock(pageKey, target), sectionId, 'Shots video')}><BlockIcon type="shots" />Shots / scroll video</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'audio', target), sectionId, 'music player')}><BlockIcon type="audio" />Music player</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addEmbedBlock(pageKey, 'map', target), sectionId, 'Google Map')}><BlockIcon type="map" />Google Map</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addButtonBlock(pageKey, target), sectionId, 'button')}><BlockIcon type="button" />Button</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addDividerBlock(pageKey, target), sectionId, 'divider')}><BlockIcon type="divider" />Divider</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addShapeBlock(pageKey, 'line', target), sectionId, 'shape')}><BlockIcon type="shape" />Shape</button>
			{!hasAboutBlock && (
				<button type="button" onClick={() => runSectionAdd((target) => editor.addAboutBlock(pageKey, target), sectionId, 'About content')}><BlockIcon type="about" />About content</button>
			)}
			<button type="button" onClick={() => runSectionAdd((target) => editor.addContactBlock(pageKey, target), sectionId, 'email button')}><BlockIcon type="contact" />Email button</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addFormBlock(pageKey, target), sectionId, 'contact form')}><BlockIcon type="form" />Contact form</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addAccordionBlock(pageKey, target), sectionId, 'accordion')}><BlockIcon type="accordion" />Accordion</button>
			<button type="button" onClick={() => runSectionAdd((target) => editor.addProjectBlock(pageKey, target), sectionId, 'project fields')}><BlockIcon type="project" />Project fields</button>
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
				<BlockIcon type="products" />
				{doc.content.store ? 'Products' : 'Set up products…'}
			</button>
			{!nested && (
				<button
					type="button"
					onClick={() =>
						runSectionAdd(
							(target) => addChild(pageKey, target),
							sectionId,
							'sub-page',
						)
					}
				>
					<BlockIcon type="children" />
					Sub-page
				</button>
			)}
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
		// Smart grids ignore the block-level crop; each piece keeps its own shape.
		const cellAr = config.smartGrid ? undefined : parseAspect(config.aspect);
		const ars = await Promise.all(
			entries.map(
				async (e) =>
					cellAr ??
					parseAspect(e.meta.cropAspect) ??
					(await measureAr(getAssetPreviewUrl(e.assetId))) ??
					e.meta.layout?.ar ??
					DEFAULT_AR,
			),
		);
		const layouts = config.smartGrid
			? smartGridLayouts(ars, uniformColumns(config.columns))
			: uniformGridLayouts(ars, uniformColumns(config.columns));
		editor.setGalleryLayouts(
			config.folder,
			Object.fromEntries(entries.map((e, i) => [e.id, roundLayout(layouts[i])])),
		);
		onPatch({ layout: undefined });
	};

	/** Lowest occupied edge in this block's section. Every freeform widget uses
	 * this shared placement rule, so adding one never covers work at the top. */
	function canvasBottomForBlock(blockId: string): number {
		let bottom = 0;
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
				if (candidate.type === 'project' && candidate.layout)
					bottom = Math.max(bottom, bottomOf(candidate.layout));
				if (candidate.type === 'form' && candidate.layout)
					bottom = Math.max(bottom, bottomOf(candidate.layout));
				if (candidate.type === 'divider' && candidate.layout)
					bottom = Math.max(bottom, bottomOf(candidate.layout));
				if (candidate.type === 'children')
					for (const item of candidate.items ?? [])
						if (item.layout) bottom = Math.max(bottom, bottomOf(item.layout));
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
		const bottom = canvasBottomForBlock(block.id);
		return roundTextLayout({
			x: (100 - width) / 2,
			y: bottom > 0 ? bottom + 2 : 0,
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
		return <>
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
			<div className="block-controls" role="group" aria-label={`Actions for ${blockLabel}`}>
			<span className="block-order-controls">
				<button
					type="button"
					className="btn-icon"
					title="Move this block earlier"
					disabled={!owner || position <= 0}
					onClick={() => owner && editor.moveBlockInSection(pageKey, owner.id, position, position - 1)}
					aria-label={`Move ${blockLabel} earlier`}
				>
					<PanelIcon type="up" />
				</button>
				<button
					type="button"
					className="btn-icon"
					title="Move this block later"
					disabled={!owner || position < 0 || position === owner.blockIds.length - 1}
					onClick={() => owner && editor.moveBlockInSection(pageKey, owner.id, position, position + 1)}
					aria-label={`Move ${blockLabel} later`}
				>
					<PanelIcon type="down" />
				</button>
			</span>
			<details className="block-more">
				<summary
					className="btn-icon"
					title="More block actions"
					aria-label={`More actions for ${blockLabel}`}
				>
					<PanelIcon type="more" />
				</summary>
				<div className="block-more-menu">
					<label className="block-more-item block-type-control" title="Change this block’s type without removing its place in the section">
						<span>Change type</span>
						<select
							className="select-input"
							value={block.type}
							aria-label={`Change type of ${blockLabel}`}
							onChange={(event) => {
								const next = event.target.value as PageBlock['type'];
								if (
									confirm(`Change this ${name} block to ${BLOCK_TYPE_OPTIONS.find((option) => option.value === next)?.label ?? next}? Its current type-specific settings will be replaced.`)
								) {
									editor.changeBlockType(pageKey, block.id, next);
									event.target.closest('details')?.removeAttribute('open');
								} else event.target.value = block.type;
							}}
						>
							{BLOCK_TYPE_OPTIONS.filter(
								// "Main gallery" is the legacy single-gallery model — keep it out of
								// the menu except on a block that already is one.
								(option) => option.value !== 'gallery' || block.type === 'gallery',
							).map((option) => (
								<option
									key={option.value}
									value={option.value}
									disabled={option.value === 'about' && hasAboutBlock && block.type !== 'about'}
								>
									{option.label}
								</option>
							))}
						</select>
					</label>
					{block.type !== 'about' && block.type !== 'children' && block.type !== 'gallery' && (
						<button
							type="button"
							className="block-more-item"
							title="Copy this block right after itself"
							onClick={(event) => {
								event.currentTarget.closest('details')?.removeAttribute('open');
								editor.duplicateBlock(pageKey, block.id);
							}}
						>
							Duplicate
						</button>
					)}
					<button
						type="button"
						className="block-more-item"
						title="Save this block so you can reuse it on any page"
						onClick={(event) => {
							event.currentTarget.closest('details')?.removeAttribute('open');
							const savedName = prompt('Name this reusable block:', `${name} block`);
							if (savedName?.trim())
								editor.saveSectionTemplate(pageKey, block.id, savedName.trim());
						}}
					>
						Save for reuse
					</button>
					<button
						type="button"
						className="block-more-item"
						title="Move this block to another section or a new section"
						onClick={(event) => {
							if (!owner) return;
							event.currentTarget.closest('details')?.removeAttribute('open');
							setPendingSectionMove({
								blockId: block.id,
								label: name,
								sourceSectionId: owner.id,
							});
							closeBlockMenus();
						}}
					>
						Move to another section…
					</button>
				</div>
			</details>
			{removable && (
				<button
					type="button"
					className="btn-icon danger"
					title="Remove this block"
					onClick={() => {
						if (
							block.type === 'about' &&
							!confirm('Remove the About content from this page? You can add it again later from Add block.')
						) return;
						editor.removeBlock(pageKey, block.id);
					}}
					aria-label={`Delete ${blockLabel}`}
				>
					<PanelIcon type="trash" />
				</button>
			)}
			</div>
		</>;
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
							<span className="block-label"><BlockIcon type="text" />Text box</span>
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
							<span className="block-label"><BlockIcon type={embedKindOf(block)} />{moduleLabel}</span>
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
							<span className="block-label"><BlockIcon type="shots" />Shots / scroll video</span>
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
							<span className="block-label"><BlockIcon type="images" />Images</span>
							{controls(index, block, true)}
						</div>
						{page.gallery && (
							<details className="block-options image-layout-options">
								<summary>
									Layout &amp; mobile <span>{galleryMode === 'grid' ? 'Grid' : 'Freeform'}</span>
								</summary>
								<div className="image-layout-options-body">
									<LayoutToggle label={`main images on ${pageName}`} mode={galleryMode} config={page.gallery} onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)} />
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
									<BatchImageTools
										folder={page.gallery.folder}
										label={`the main images on ${pageName}`}
										gridMode={galleryMode === 'grid'}
									/>
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
				const hasGroupMobileSettings = phoneItemsFor(block.gallery).length > 0 || !!block.gallery.mobile;
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
				const carouselRatio = block.gallery.carouselCustomRatio
					? 'custom'
					: CAROUSEL_RATIOS.find((option) => Math.abs(option.ar - carouselFrame.ar) < 0.01)?.value ?? 'custom';
				const setCarouselRatio = (value: string) => {
					if (value === 'custom') {
						patchGroup({ carouselCustomRatio: true, carouselFreeResize: undefined });
						return;
					}
					const option = CAROUSEL_RATIOS.find((candidate) => candidate.value === value);
					if (!option) return;
					patchGroup({
						carouselFreeResize: undefined,
						carouselCustomRatio: undefined,
						carouselFrame: roundLayout({ ...carouselFrame, ar: option.ar }),
					});
				};
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label block-label-named">
								<BlockIcon type="images" />
								<input
									className="block-name-input"
									value={block.name ?? ''}
									placeholder="Image group"
									title="Name this group (only shown here in the editor)"
									aria-label={`Name for ${groupLabel}`}
									onChange={(e) => editor.renameImagesBlock(pageKey, block.id, e.target.value)}
								/>
							</span>
							{controls(index, block, true)}
						</div>
						<div className="image-group-layout-bar" data-tour="image-group-layout">
							<div>
								<strong>Layout</strong>
								<HelpTip label="About group layout" tip="Choose how the group appears on the page." />
							</div>
							<LayoutToggle
								label={groupLabel}
								mode={carousel ? 'carousel' : groupMode}
								config={block.gallery}
								onPatch={patchGroup}
								carousel
							/>
						</div>
						{(carousel || groupMode === 'grid' || hasGroupMobileSettings) && (
						<details className="block-options image-layout-options image-group-layout-options">
							<summary>
								Customize layout <span>{carousel ? 'Carousel settings' : groupMode === 'grid' ? 'Grid settings' : 'Mobile settings'}</span>
							</summary>
							<div className="image-layout-options-body">
								{carousel && (
									<div className="carousel-settings">
										<details className="carousel-setting-group">
											<summary>
												<span>Frame &amp; crop</span>
												<small>{(block.gallery.carouselFit ?? 'fit') === 'fit' ? 'Fit' : 'Fill'} · {carouselRatio === 'custom' ? 'Custom ratio' : carouselRatio}</small>
											</summary>
											<div className="carousel-setting-group-body">
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
												{carouselRatio !== 'custom' && <option value="custom">Custom ratio</option>}
													{CAROUSEL_RATIOS.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
										</label>
						{carouselRatio === 'custom' && (
							<CarouselCustomRatioInputs
								aspect={carouselFrame.ar}
								onChange={(aspect) => patchGroup({
									carouselFreeResize: undefined,
									carouselCustomRatio: true,
									carouselFrame: roundLayout({
										...carouselFrame,
										ar: Math.min(Math.max(aspect, 0.2), 5),
									}),
								})}
							/>
						)}
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
											</div>
										</details>
										<details className="carousel-setting-group">
											<summary>
												<span>Controls &amp; style</span>
												<small>{block.gallery.carouselArrowStyle ?? 'chevron'} · {block.gallery.carouselFrameStyle ?? 'no frame'}</small>
											</summary>
											<div className="carousel-setting-group-body">
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
												className={`btn-link ${block.gallery.carouselChromeColor ? '' : 'active'}`}
												aria-pressed={!block.gallery.carouselChromeColor}
												onClick={() => patchGroup({ carouselChromeColor: undefined })}
											>
												Auto
													</button>
												</span>
											</label>
											<label className="carousel-chrome-color">
												Arrow color
												<span className="color-field">
											<input type="color" value={/^#[\da-f]{6}$/i.test(block.gallery.carouselArrowColor ?? '') ? block.gallery.carouselArrowColor! : /^#[\da-f]{6}$/i.test(doc.content.theme.backgroundColor) ? doc.content.theme.backgroundColor : '#ffffff'} onChange={(event) => patchGroup({ carouselArrowColor: event.target.value })} aria-label={`Carousel arrow glyph color for ${groupLabel}`} />
											<button type="button" className={`btn-link ${block.gallery.carouselArrowColor ? '' : 'active'}`} aria-pressed={!block.gallery.carouselArrowColor} onClick={() => patchGroup({ carouselArrowColor: undefined })}>Auto</button>
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
											</div>
										</details>
										{block.gallery.carouselFrame && (
											<button
												type="button"
												className="btn-link carousel-reset-frame"
												onClick={() =>
													patchGroup({
												carouselFrame: undefined,
												carouselFreeResize: undefined,
												carouselCustomRatio: undefined,
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
								{!carousel && hasGroupMobileSettings && (
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
						)}
						{!carousel && (
							<BatchImageTools
								folder={block.gallery.folder}
								label={groupLabel}
								gridMode={groupMode === 'grid'}
							/>
						)}
						<ImageCollectionEditor
							embedded
							folder={block.gallery.folder}
							variant="gallery"
							addLabel="+ Add image(s)"
							emptyLabel="No images in this group yet."
							requireAltText={false}
							focusedUi
							hint={
								carousel
									? 'Images appear one at a time. Drag rows to set the sequence.'
									: groupMode === 'grid'
										? 'Grid placement is automatic. Drag rows to set the sequence.'
										: 'Drag images in the preview to position them. Drag rows here to set which sits in front.'
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
							<span className="block-label"><BlockIcon type="button" />Button</span>
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
				{
					const owner = sectionForBlock(block.id);
				return (
					<div className="block divider-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="divider" />Divider</span>
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
						<button
							type="button"
							className={block.layout ? 'btn-secondary active' : 'btn-secondary'}
							onClick={() => {
								if (block.layout) {
									editor.updateDividerBlock(pageKey, block.id, { layout: undefined });
									return;
								}
								if (owner && !sectionHasFreeCanvas(owner.id))
									editor.addFreeformGallery(pageKey, block.id, owner.id);
								const bottom = canvasBottomForBlock(block.id);
								editor.updateDividerBlock(pageKey, block.id, {
									layout: { x: 5, y: bottom > 0 ? bottom + 2 : 0, w: 90, ar: 45 },
								});
							}}
						>
							{block.layout ? 'Return divider to page flow' : 'Place divider freeform'}
						</button>
						<PortfolioDivider
							style={block.style}
							width={block.width}
							color={block.color}
						/>
					</div>
				);
				}
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
							<span className="block-label"><BlockIcon type="products" />Products shown on this page</span>
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
			case 'project': {
				const fieldKeys: ProjectFieldKey[] = ['year', 'medium', 'dimensions', 'collaborators', 'exhibitionHistory'];
				const labels: Record<ProjectFieldKey, string> = {
					year: 'Year', medium: 'Medium', dimensions: 'Dimensions', collaborators: 'Collaborators', exhibitionHistory: 'Exhibition history',
				};
				const order = [...(block.order ?? []), ...fieldKeys.filter((key) => !(block.order ?? []).includes(key))];
				const owner = sectionForBlock(block.id);
				const updateOrder = (from: number, to: number) => {
					const next = order.slice();
					const [item] = next.splice(from, 1);
					next.splice(to, 0, item);
					editor.updateProjectBlock(pageKey, block.id, { order: next });
				};
				return (
					<div className="block project-editor-block" key={block.id}>
						<div className="block-head"><span className="block-label"><BlockIcon type="project" />Project fields</span>{controls(index, block, true)}</div>
						<div className="block-choice-row">
							<label>Template<select className="select-input" value={block.project.template} onChange={(event) => editor.updateProjectBlock(pageKey, block.id, { project: { ...block.project, template: event.target.value as ProjectTemplate } })}><option value="artwork">Artwork</option><option value="collaboration">Collaboration</option><option value="exhibition">Exhibition</option></select></label>
							<label>Font<select className="select-input" value={block.fontFamily ?? ''} onChange={(event) => editor.updateProjectBlock(pageKey, block.id, { fontFamily: event.target.value || undefined })}><option value="">Page font</option>{textFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
							<label>Size<input className="text-input compact-number" type="number" min={8} max={96} value={block.fontSize ?? 16} onChange={(event) => editor.updateProjectBlock(pageKey, block.id, { fontSize: Number(event.target.value) || undefined })} /></label>
							<button type="button" className={block.layout ? 'btn-secondary active' : 'btn-secondary'} onClick={() => {
								if (block.layout) editor.setWidgetLayout(pageKey, block.id, undefined);
								else {
									if (owner && !sectionHasFreeCanvas(owner.id)) editor.addFreeformGallery(pageKey, block.id, owner.id);
									editor.setWidgetLayout(pageKey, block.id, { x: 15, y: canvasBottomForBlock(block.id) + 2, w: 70, ar: 3 });
								}
							}}>{block.layout ? 'Back to flow' : 'Freeform'}</button>
						</div>
						<div className="project-field-grid">
							{order.map((key, fieldIndex) => <div className="project-block-field" key={key}>
								<input className="text-input" value={block.labels?.[key] ?? labels[key]} aria-label={`${labels[key]} label`} onChange={(event) => editor.updateProjectBlock(pageKey, block.id, { labels: { ...block.labels, [key]: event.target.value } })} />
								<textarea className="text-area" rows={key === 'exhibitionHistory' ? 3 : 1} value={block.project[key] ?? ''} placeholder={labels[key]} onChange={(event) => editor.updateProjectBlock(pageKey, block.id, { project: { ...block.project, [key]: event.target.value || undefined } })} />
								<button type="button" className="btn-icon" disabled={fieldIndex === 0} onClick={() => updateOrder(fieldIndex, fieldIndex - 1)}>↑</button>
								<button type="button" className="btn-icon" disabled={fieldIndex === order.length - 1} onClick={() => updateOrder(fieldIndex, fieldIndex + 1)}>↓</button>
							</div>)}
						</div>
					</div>
				);
			}
			case 'contact': {
				const contactLabel = `contact block ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="contact" />Email button</span>
							{controls(index, block, true)}
						</div>
						<Field label="Heading">
							<TextInput
								aria-label={`Heading for ${contactLabel}`}
								value={block.heading ?? ''}
								placeholder="Get in touch"
								onChange={(event) => editor.updateContactBlock(pageKey, block.id, { heading: event.target.value })}
							/>
						</Field>
						<Field label="Short text">
							<TextInput
								aria-label={`Text for ${contactLabel}`}
								value={block.text ?? ''}
								placeholder="Email me about commissions, prints, or studio visits."
								onChange={(event) => editor.updateContactBlock(pageKey, block.id, { text: event.target.value })}
							/>
						</Field>
						<ContactEmailField
							email={block.email}
							ariaLabel={`Email address for ${contactLabel}`}
							onChange={(email) => editor.updateContactBlock(pageKey, block.id, { email })}
						/>
						<Field label="Words on the button">
							<TextInput
								aria-label={`Button words for ${contactLabel}`}
								value={block.buttonLabel ?? ''}
								placeholder={DEFAULT_CONTACT_BUTTON_LABEL}
								onChange={(event) => editor.updateContactBlock(pageKey, block.id, { buttonLabel: event.target.value })}
							/>
						</Field>
					</div>
				);
			}
			case 'shape': {
				const shapeLabel = `${block.shape} shape ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="shape" />Shape</span>
							{controls(index, block, true)}
						</div>
						<div className="block-choice-row">
							<label>
								Shape
								<select
									className="select-input"
									value={block.shape}
									aria-label={`Kind of ${shapeLabel}`}
									onChange={(event) =>
										editor.updateShapeBlock(pageKey, block.id, {
											shape: event.target.value as typeof block.shape,
										})
									}
								>
									<option value="line">Line</option>
									<option value="arrow">Arrow</option>
									<option value="rectangle">Rectangle</option>
								</select>
							</label>
							{block.shape === 'arrow' && (
								<label>
									Points
									<select
										className="select-input"
										value={block.direction ?? 'right'}
										aria-label={`Direction of ${shapeLabel}`}
										onChange={(event) =>
											editor.updateShapeBlock(pageKey, block.id, {
												direction:
													event.target.value === 'right'
														? undefined
														: (event.target.value as NonNullable<typeof block.direction>),
											})
										}
									>
										<option value="right">Right</option>
										<option value="left">Left</option>
										<option value="up">Up</option>
										<option value="down">Down</option>
									</select>
								</label>
							)}
							<label>
								Thickness
								<select
									className="select-input"
									value={String(block.strokeWidth ?? 1)}
									aria-label={`Stroke width of ${shapeLabel}`}
									onChange={(event) => {
										const value = Number(event.target.value);
										editor.updateShapeBlock(pageKey, block.id, {
											strokeWidth: value === 1 ? undefined : value,
										});
									}}
								>
									{[1, 2, 3, 4, 6, 8, 12].map((width) => (
										<option key={width} value={String(width)}>{width}px</option>
									))}
								</select>
							</label>
							<label>
								Color
								<span className="color-field">
									<input
										type="color"
										aria-label={`Color of ${shapeLabel}`}
										value={
											/^#[\da-f]{6}$/i.test(block.color ?? '')
												? block.color
												: /^#[\da-f]{6}$/i.test(doc.content.theme.textColor)
													? doc.content.theme.textColor
													: '#111111'
										}
										onChange={(event) =>
											editor.updateShapeBlock(pageKey, block.id, { color: event.target.value })
										}
									/>
									{block.color && (
										<button
											type="button"
											className="btn-link"
											onClick={() => editor.updateShapeBlock(pageKey, block.id, { color: undefined })}
										>
											Use theme ink
										</button>
									)}
								</span>
							</label>
						</div>
					</div>
				);
			}
			case 'accordion': {
				const accordionLabel = `accordion ${index + 1} on ${pageName}`;
				const updateItems = (items: typeof block.items) =>
					editor.updateAccordionBlock(pageKey, block.id, { items });
				const moveItem = (from: number, to: number) => {
					if (to < 0 || to >= block.items.length) return;
					const items = [...block.items];
					const [moved] = items.splice(from, 1);
					items.splice(to, 0, moved);
					updateItems(items);
				};
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="accordion" />Accordion</span>
							{controls(index, block, true)}
						</div>
						<div className="form-fields-editor">
							<span className="field-label">Rows</span>
							{block.items.map((item, itemIndex) => (
								<div className="accordion-row-editor" key={item.id}>
									<div className="form-field-row">
										<input
											className="text-input"
											value={item.title}
											placeholder="Row title"
											aria-label={`Title of row ${itemIndex + 1} in ${accordionLabel}`}
											onChange={(event) => updateItems(block.items.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row))}
										/>
										<button type="button" className="btn-icon" disabled={itemIndex === 0} aria-label={`Move row ${itemIndex + 1} up in ${accordionLabel}`} onClick={() => moveItem(itemIndex, itemIndex - 1)}>↑</button>
										<button type="button" className="btn-icon" disabled={itemIndex === block.items.length - 1} aria-label={`Move row ${itemIndex + 1} down in ${accordionLabel}`} onClick={() => moveItem(itemIndex, itemIndex + 1)}>↓</button>
										<button type="button" className="btn-icon danger" aria-label={`Remove row ${itemIndex + 1} from ${accordionLabel}`} onClick={() => updateItems(block.items.filter((row) => row.id !== item.id))}>✕</button>
									</div>
									<textarea
										className="text-area"
										rows={2}
										value={item.text ?? ''}
										placeholder="Words shown when this row is open"
										aria-label={`Words inside row ${itemIndex + 1} of ${accordionLabel}`}
										onChange={(event) => updateItems(block.items.map((row) => row.id === item.id ? { ...row, text: event.target.value || undefined } : row))}
									/>
								</div>
							))}
							<button type="button" className="btn-link" aria-label={`Add a row to ${accordionLabel}`} onClick={() => updateItems([...block.items, { id: uid('row'), title: 'New row', text: '' }])}>＋ Add a row</button>
						</div>
						<Field label="Title size (pt)" hint="Display scale is the point — Mosley runs its accordion titles near 92pt.">
							<input
								type="number"
								className="text-input"
								min={8}
								max={200}
								value={block.titleSize ?? 56}
								aria-label={`Title size for ${accordionLabel}`}
								onChange={(event) => {
									const value = Number(event.target.value);
									editor.updateAccordionBlock(pageKey, block.id, {
										titleSize: Number.isFinite(value) ? Math.min(Math.max(value, 8), 200) : undefined,
									});
								}}
							/>
						</Field>
					</div>
				);
			}
			case 'form': {
				const endpointInvalid = !!block.action && (!isUrl(block.action) || !block.action.startsWith('https://'));
				const updateFields = (fields: FormField[]) => editor.updateFormBlock(pageKey, block.id, { fields });
				const formLabel = `contact form ${index + 1} on ${pageName}`;
				const owner = sectionForBlock(block.id);
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="form" />Contact form</span>
							{controls(index, block, true)}
						</div>
						<Field label="Form heading">
							<TextInput aria-label={`Heading for ${formLabel}`} value={block.heading ?? ''} placeholder="Get in touch" onChange={(event) => editor.updateFormBlock(pageKey, block.id, { heading: event.target.value })} />
						</Field>
						<ContactEmailField
							email={block.recipientEmail}
							ariaLabel={`Site owner delivery email for ${formLabel}`}
							label="Site owner delivery email"
							hint="Private form setting: this is where a visitor's message is addressed. It is separate from the public email shown in About."
							onChange={(recipientEmail) => editor.updateFormBlock(pageKey, block.id, { recipientEmail })}
						/>
						<Field
							label="Optional form service address"
							hint="Leave this blank to open the visitor’s email app with a message addressed to the site owner email above. To send directly in the page instead, paste the form address from a service such as Formspree."
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
						<button type="button" className={block.layout ? 'btn-secondary active' : 'btn-secondary'} onClick={() => {
							if (block.layout) editor.setWidgetLayout(pageKey, block.id, undefined);
							else {
								if (owner && !sectionHasFreeCanvas(owner.id)) editor.addFreeformGallery(pageKey, block.id, owner.id);
								const bottom = canvasBottomForBlock(block.id);
								editor.setWidgetLayout(pageKey, block.id, { x: 15, y: bottom > 0 ? bottom + 2 : 0, w: 70, ar: 3 });
							}
						}}>{block.layout ? 'Back to flow' : 'Move form Freeform'}</button>
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
							<span className="block-label"><BlockIcon type="about" />About content</span>
							{controls(index, block, true)}
						</div>
						<p className="muted about-editor-intro">Everything below appears in this section and updates in the preview as you type.</p>
						<AboutContentEditor />
					</div>
				);
			case 'children':
				{
					const items: ChildPageItem[] = block.items ?? (page.children ?? []).map((childKey) => ({
						id: childKey,
						page: childKey,
						label: doc.content.pages[childKey]?.label ?? childKey,
					}));
					const updateItems = (next: typeof items) =>
						editor.updateChildrenBlock(pageKey, block.id, { items: next });
					const owner = sectionForBlock(block.id);
					const hasLegacyCardLayouts = items.some((item) => item.layout);
					// One placement model: the block hangs as a single widget. Older
					// docs with individually placed cards get a one-click migration.
					const gatherCardsIntoBlock = () => {
						if (owner && !sectionHasFreeCanvas(owner.id))
							editor.addFreeformGallery(pageKey, block.id, owner.id);
						editor.updateChildrenBlock(pageKey, block.id, {
							items: items.map((item) => ({ ...item, layout: undefined })),
							canvasLayout: collectionLayoutAtCanvasBottom(
								'children',
								canvasBottomForBlock(block.id),
							),
						});
					};
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label"><BlockIcon type="children" />Sub-pages</span>
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
							{controls(index, block, true)}
						</div>
						{hasLegacyCardLayouts ? (
							<div className="collection-canvas-control">
								<span>
									<strong>Cards placed one by one (older layout)</strong>
									<small>Gather them into a single sub-pages block you can drag and resize as one.</small>
								</span>
								<button type="button" className="btn-secondary" onClick={gatherCardsIntoBlock}>
									Gather into one block
								</button>
							</div>
						) : (
							collectionCanvasControl(block, 'sub-pages')
						)}
						<div className="subpage-card-list">
							{items.map((item, childIndex, childList) => {
								const child = doc.content.pages[item.page];
								const childName = item.label || child?.label || item.page;
								const targetName = child?.label || (item.page === 'home' ? 'Home' : item.page);
								const thumbUrl = getAssetPreviewUrl(doc.pageThumbs[item.page]?.assetId ?? null);
								return (
									<article className={`subpage-card${item.layout ? ' is-freeform' : ''}`} key={item.id}>
										<div className="subpage-card-main">
											<div className="child-thumb-picker">
												<ImageDrop ariaLabel={`Choose a thumbnail for ${childName}`} onFiles={(files) => editor.setPageThumb(item.page, files[0])}>
													{thumbUrl ? <img className="child-thumb" src={thumbUrl} alt="" /> : <span>＋</span>}
												</ImageDrop>
											</div>
											<div className="subpage-card-copy">
												<span>Card {childIndex + 1}</span>
												<TextInput
													value={item.label ?? child?.label ?? item.page}
													aria-label={`Display text for ${childName} under ${pageName}`}
													onChange={(event) => updateItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate))}
													placeholder="Card text"
												/>
											</div>
											<div className="subpage-card-actions" role="group" aria-label={`Arrange ${childName}`}>
												<button type="button" className="btn-icon" disabled={childIndex === 0} onClick={() => updateItems(items.map((candidate, index) => index === childIndex - 1 ? items[childIndex] : index === childIndex ? items[childIndex - 1] : candidate))} aria-label={`Move sub-page ${childName} earlier on ${pageName}`}>↑</button>
												<button type="button" className="btn-icon" disabled={childIndex === childList.length - 1} onClick={() => updateItems(items.map((candidate, index) => index === childIndex + 1 ? items[childIndex] : index === childIndex ? items[childIndex + 1] : candidate))} aria-label={`Move sub-page ${childName} later on ${pageName}`}>↓</button>
												<button type="button" className="btn-icon danger" onClick={() => updateItems(items.filter((candidate) => candidate.id !== item.id))} aria-label={`Remove ${childName} from this block`}>✕</button>
											</div>
										</div>
										<details className="subpage-card-details">
											<summary>
												<span>Linked page</span>
												<small>{targetName}</small>
											</summary>
											<div className="subpage-card-details-body">
												<label>
													<span>Linked page</span>
													<select className="select-input child-page-target" value={item.page} aria-label={`Page linked by ${childName}`} onChange={(event) => updateItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, page: event.target.value } : candidate))}>
														{Object.entries(doc.content.pages).map(([targetKey, targetPage]) => <option key={targetKey} value={targetKey}>{targetPage.label || (targetKey === 'home' ? 'Home' : targetKey)}</option>)}
													</select>
												</label>
											</div>
										</details>
									</article>
								);
							})}
						</div>
						<div className="subpage-block-actions">
							<select className="select-input" value="" aria-label={`Add an existing page to ${pageName}`} onChange={(event) => {
								const target = event.target.value;
								if (!target) return;
								updateItems([...items, { id: uid('subpage'), page: target, label: doc.content.pages[target]?.label ?? target }]);
							}}>
								<option value="">＋ Link an existing page…</option>
								{Object.entries(doc.content.pages).filter(([key]) => !items.some((item) => item.page === key)).map(([key, target]) => <option key={key} value={key}>{target.label || key}</option>)}
							</select>
							<button type="button" className="btn-primary" onClick={() => addChild(pageKey, owner?.id)}>＋ Create new sub-page</button>
						</div>
						<HelpDisclosure label="How sub-page cards work">
							<p>Each card has its own display text, destination, and thumbnail. The block hangs on the canvas as one piece — drag it to move it, or drag a corner to set its width; its height follows the cards.</p>
						</HelpDisclosure>
					</div>
				);
				}
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
			<Field label="Hangpieces on this page">
				<div className="chip-row" role="group" aria-label={`Artwork hanging on ${pageName}`}>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === undefined ? 'active' : ''}`}
						aria-pressed={page.hanging === undefined}
						onClick={() => editor.setPageHanging(pageKey, undefined)}
					>
						Use site
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === true ? 'active' : ''}`}
						aria-pressed={page.hanging === true}
						onClick={() => editor.setPageHanging(pageKey, true)}
					>
						Hang page
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${page.hanging === false ? 'active' : ''}`}
						aria-pressed={page.hanging === false}
						onClick={() => editor.setPageHanging(pageKey, false)}
					>
						Straight page
					</button>
				</div>
				{page.hanging === true && (
					<label className="motion-range compact page-hang-strength-control">
						<span>
							Page tilt <output>{pageHangingStrength.toFixed(2)}°</output>
						</span>
						<input
							type="range"
							min={0.25}
							max={5}
							step={0.25}
							value={pageHangingStrength}
							aria-label={`Hangpiece tilt on ${pageName}`}
							onChange={(event) =>
								editor.setPageHangingStrength(pageKey, Number(event.target.value))
							}
						/>
					</label>
				)}
				<small className="scope-summary">
					{page.hanging === undefined
						? `Following the site: ${siteHanging ? `${siteHangingStrength.toFixed(2)}° tilt` : 'straight'}.`
						: page.hanging
							? 'This page overrides the site. Individual images can still override this angle.'
							: 'This page stays straight. Individual images can still opt into a tilt.'}
				</small>
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
		</>
	);

	return (
		<Section
			sectionKey={pageKey}
			defaultCollapsed={nested && includeChildren}
			title={nested ? `↳ ${page.label ?? pageKey}` : isHome ? `Page: ${page.label || 'Home'}` : `Page: ${page.label ?? pageKey}`}
		>
			<label className="selected-block-follow-toggle">
				<input
					type="checkbox"
					checked={autoScrollSelected}
					onChange={(event) => {
						setAutoScrollSelected(event.target.checked);
						localStorage.setItem(AUTO_SCROLL_SELECTED_STORE, String(event.target.checked));
					}}
				/>
				Auto-scroll to selected block
			</label>
			{nested && parentPageEntry && (
				<button type="button" className="btn-primary add-sibling-subpage" onClick={() => addChild(parentPageEntry[0])}>
					＋ Add another sub-page
				</button>
			)}
			{/* Details stay tucked away — the column leads with the page's blocks. */}
			<details className="page-settings-disclosure">
				<summary>
					<span>
						<strong>Page details</strong>
						<small>Name, heading &amp; hangpieces</small>
					</span>
					<span className="page-editor-advanced-chevron" aria-hidden="true">⌄</span>
				</summary>
				<div className="page-settings-body">{pageDetailsFields}</div>
			</details>

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
									<div
										className="page-section-editor-head"
										data-tour={sectionIndex === 0 ? 'page-section' : undefined}
									>
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
											<SectionMotionPicker
												label={`Scroll scene for Section ${sectionIndex + 1}, ${section.name}`}
												value={page.sectionMotion?.[partKey]}
												onChange={(motion) =>
													editor.setSectionMotion(pageKey, partKey, motion)
												}
											/>
											<button
												type="button"
												className={`btn-icon${page.sectionBleed?.[partKey] ? ' active' : ''}`}
												aria-pressed={!!page.sectionBleed?.[partKey]}
												onClick={() =>
													editor.setSectionBleed(
														pageKey,
														partKey,
														!page.sectionBleed?.[partKey],
													)
												}
												aria-label={`Full bleed for Section ${sectionIndex + 1}, ${section.name}`}
												title="Full bleed — this section's canvas spans the whole screen, edge to edge"
											>
												↔
											</button>
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
												className={`${itemIsCollapsed('block', block.id) ? 'is-collapsed' : ''}${selectedBlockId === block.id ? ' is-selected-editor-block' : ''}`.trim() || undefined}
												onPointerDown={() => setSelectedBlockId(block.id)}
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
						hint="Choose how this page moves as visitors scroll. Scenes cascade: a section's own scene wins, then the whole-page scene, then the site's from Design. Off pins that level still; motion stays off on phones unless you opt in."
					>
						<div className="scroll-scene-list">
							<div className="scroll-scene-row">
								<div className="scroll-scene-heading">
									<strong>Whole page</strong>
									<select
										className="select-input"
										value={page.motion?.effect ?? ''}
										aria-label="Scroll scene for the whole page"
										onChange={(event) =>
											editor.setPageMotion(
												pageKey,
												nextSectionMotion(
													page.motion,
													event.target.value as SectionMotionEffect | '',
												),
											)
										}
									>
										{SECTION_MOTION_CHOICES.map((choice) => (
											<option key={choice.value || 'inherit'} value={choice.value}>
												{choice.value === '' ? 'Inherit site scene' : choice.label}
											</option>
										))}
									</select>
								</div>
								{page.motion && page.motion.effect !== 'none' && (
									<div className="scroll-scene-options">
										<label className="motion-range compact">
											<span>Strength <output>{page.motion.intensity ?? 45}%</output></span>
											<input
												type="range"
												min={1}
												max={100}
												step={1}
												value={page.motion.intensity ?? 45}
												onChange={(event) =>
													editor.setPageMotion(pageKey, {
														...page.motion!,
														intensity: Number(event.target.value),
													})
												}
											/>
										</label>
										<label className="compact-check">
											<input
												type="checkbox"
												checked={page.motion.phone ?? false}
												onChange={(event) =>
													editor.setPageMotion(pageKey, {
														...page.motion!,
														phone: event.target.checked || undefined,
													})
												}
											/>
											Use on phones
										</label>
									</div>
								)}
							</div>
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
												onChange={(event) =>
													editor.setSectionMotion(
														pageKey,
														item.key,
														nextSectionMotion(
															motion,
															event.target.value as SectionMotionEffect | '',
														),
													)
												}
											>
												{SECTION_MOTION_CHOICES.map((choice) => (
													<option key={choice.value || 'inherit'} value={choice.value}>
														{choice.label}
													</option>
												))}
											</select>
										</div>
										{motion && motion.effect !== 'none' && (
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

			{newSubpageName !== null && pendingSubpage && (
				<Modal
					title={`Add a sub-page under ${doc.content.pages[pendingSubpage.parentKey]?.label || pageName}`}
					onClose={() => { setNewSubpageName(null); setPendingSubpage(null); }}
					footer={
						<>
							<button type="button" className="btn-ghost" onClick={() => { setNewSubpageName(null); setPendingSubpage(null); }}>Cancel</button>
							<button
								type="button"
								className="btn-primary"
								disabled={!newSubpageName.trim()}
								onClick={() => {
									const name = newSubpageName.trim();
									if (!name) return;
									editor.addChildPage(pendingSubpage.parentKey, name, pendingSubpage.sectionId);
									setNewSubpageName(null);
									setPendingSubpage(null);
								}}
							>
								Add sub-page
							</button>
						</>
					}
				>
					<label className="field">
						<span className="field-label">Sub-page name</span>
						<input
							className="text-input"
							value={newSubpageName}
							onChange={(event) => setNewSubpageName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== 'Enter' || !newSubpageName.trim()) return;
								event.preventDefault();
								editor.addChildPage(pendingSubpage.parentKey, newSubpageName.trim(), pendingSubpage.sectionId);
								setNewSubpageName(null);
								setPendingSubpage(null);
							}}
							placeholder="For example, Paintings"
							autoFocus
						/>
					</label>
					<p className="muted">A new page will be created and one independently editable card will be added to the section you chose.</p>
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
