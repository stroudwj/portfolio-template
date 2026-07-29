// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useRef } from 'react';
import { useEditor } from '../store';
import { Field, TextInput, Section, showEditorTab } from './ui/controls';
import { ColorSwatchPicker } from './ui/ColorSwatchPicker';
import ImageCollectionEditor from './ImageCollectionEditor';
import MobileArrangementEditor, { type MobileArrangementItem } from './MobileArrangementEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl, uid } from '../lib/assets';
import { videoEmbedSrc } from '../../portfolio/videoEmbed';
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
import { isUrl } from '../lib/validation';
import { fontOptionsForTheme } from '../lib/font-options';
import type { ChildrenStyle, FormField, GalleryConfig, PageBlock, TextAlign } from '../../lib/content';
import AboutContentEditor from './AboutContentEditor';
import RichTextEditor from './RichTextEditor';

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
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const pageName = page.label || (isHome ? 'Home' : pageKey);
	const blocks = page.blocks ?? [];
	const hasAboutBlock = blocks.some((block) => block.type === 'about');
	// Offer the site's own palette first in every color-blocking picker.
	const themeColors = [
		doc.content.theme.backgroundColor,
		doc.content.theme.textColor,
		doc.content.theme.accentColor,
	].filter(Boolean);
	const textFontOptions = fontOptionsForTheme(doc.content.theme);
	const galleryMode = page.gallery?.layout === 'grid' ? 'grid' : 'freeform';
	/** Text can be dragged onto the canvas only when the page shows a freeform gallery. */
	const hasFreeCanvas = !!page.gallery && galleryMode === 'freeform' && blocks.some((b) => b.type === 'gallery');
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
		const pinned = blocks.flatMap<{
			item: MobileArrangementItem;
			y: number;
			kind: 'text' | 'video';
			index: number;
		}>((block, index) => {
			if (block.type === 'text' && block.layout) {
				const words = block.text.trim().replace(/\s+/g, ' ');
				return [{ item: { key: `text:${block.id}`, label: words ? words.slice(0, 45) : 'Text', kind: 'text' }, y: block.layout.y, kind: 'text', index }];
			}
			if (block.type === 'embed' && block.layout)
				return [{ item: { key: `video:${block.id}`, label: 'Video', kind: 'video' }, y: block.layout.y, kind: 'video', index }];
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
		...blocks.flatMap((block, index) => {
		if (hasFreeCanvas && (block.type === 'text' || block.type === 'embed') && block.layout) return [];
		const label =
			block.type === 'text'
				? block.text.trim().replace(/\s+/g, ' ').slice(0, 45) || `Text ${index + 1}`
				: block.type === 'gallery'
					? 'Main images'
					: block.type === 'images'
						? block.name || `Image group ${index + 1}`
						: block.type === 'embed'
							? 'Video'
							: block.type === 'button'
								? `Button: ${block.label || 'Untitled'}`
								: block.type === 'divider'
									? 'Divider line'
									: block.type === 'products'
										? 'Products'
									: block.type === 'form'
										? block.heading || 'Contact form'
										: block.type === 'about'
											? 'About section'
											: 'Sub-pages';
		return [{ key: `block:${block.id}`, label, kind: 'section' as const }];
		}),
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
					pageContentRef.current?.querySelectorAll<HTMLElement>(':scope > [data-editor-block]') ?? [],
				).find((element) => !before.has(element.dataset.editorBlock ?? ''));
				added?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}),
		);
	};

	const addBlockMenuItems = () => (
		<>
			<button type="button" onClick={() => runAdd(() => editor.addTextBlock(pageKey))}>Text</button>
			<button type="button" onClick={() => runAdd(() => editor.addImagesBlock(pageKey))}>Image group</button>
			<button type="button" onClick={() => runAdd(() => editor.addEmbedBlock(pageKey))}>Video</button>
			<button type="button" onClick={() => runAdd(() => editor.addButtonBlock(pageKey))}>Button</button>
			<button type="button" onClick={() => runAdd(() => editor.addDividerBlock(pageKey))}>Divider</button>
			{!hasAboutBlock && (
				<button type="button" onClick={() => runAdd(() => editor.addAboutBlock(pageKey))}>About content</button>
			)}
			<button type="button" onClick={() => runAdd(() => editor.addFormBlock(pageKey))}>Contact form</button>
			<button
				type="button"
				onClick={() =>
					runAdd(() => {
						if (doc.content.store) editor.addProductsBlock(pageKey);
						else showEditorTab('store');
					})
				}
			>
				{doc.content.store ? 'Products' : 'Set up products…'}
			</button>
			{!nested && <button type="button" onClick={() => runAdd(addChild, false)}>Sub-page</button>}
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

	/** Put a newly pinned text box after the lowest existing canvas item and
	 * center it horizontally, so it is immediately visible without covering art. */
	const textLayoutAtCanvasBottom = (block: Extract<PageBlock, { type: 'text' }>) => {
		const width = Math.min(block.flowLayout?.w ?? 50, 60);
		let bottom = 18;
		if (hasFreeCanvas && page.gallery) {
			const entries = doc.galleries[page.gallery.folder] ?? [];
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
				if (candidate.id === block.id) continue;
				if (candidate.type === 'text' && candidate.layout)
					bottom = Math.max(bottom, textBottom(candidate.layout));
				if (candidate.type === 'embed' && candidate.layout)
					bottom = Math.max(bottom, bottomOf(candidate.layout));
			}
		}
		return roundTextLayout({
			x: (100 - width) / 2,
			y: bottom + 2,
			w: width,
		});
	};

	const controls = (index: number, block: PageBlock, removable: boolean) => {
		const name =
			block.type === 'images' ? block.name || 'image group' :
			block.type === 'embed' ? 'video' :
			block.type === 'children' ? 'sub-pages' :
			block.type === 'products' ? 'products' :
			block.type === 'form' ? 'contact form' :
			block.type === 'divider' ? 'divider' : block.type;
		const blockLabel = `${name} block ${index + 1} on ${pageName}`;
		return <div className="block-controls" role="group" aria-label={`Actions for ${blockLabel}`}>
			<ColorSwatchPicker
				label={`Background color for ${blockLabel}`}
				value={page.sectionColors?.[`block:${block.id}`]}
				themeColors={themeColors}
				onChange={(color) => editor.setSectionColor(pageKey, `block:${block.id}`, color)}
			/>
			<button
				type="button"
				className="btn-icon"
				disabled={index === 0}
				onClick={() => editor.moveBlock(pageKey, index, index - 1)}
				aria-label={`Move ${blockLabel} earlier`}
			>
				↑
			</button>
			<button
				type="button"
				className="btn-icon"
				disabled={index === blocks.length - 1}
				onClick={() => editor.moveBlock(pageKey, index, index + 1)}
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
		switch (block.type) {
			case 'text': {
				const textLabel = `text block ${index + 1} on ${pageName}`;
				const fontLinked = !block.fontFamily;
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
						<details className="block-options">
							<summary aria-label={`Add a link to ${textLabel}`}>Add a link to this text</summary>
							<input
								className={`text-input ${!isPageOrWebLink(block.link ?? '') ? 'invalid' : ''}`}
								value={block.link ?? ''}
								placeholder="https://…"
								aria-label={`Link for ${textLabel}`}
								onChange={(event) => editor.setTextLink(pageKey, block.id, event.target.value)}
							/>
							{!isPageOrWebLink(block.link ?? '') && <span className="field-error">Use a full web address beginning with https://.</span>}
						</details>
						{!block.layout && (
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
						{block.layout ? (
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
										{hasFreeCanvas
											? 'Drag this text box in the preview to place it anywhere on the image canvas.'
											: 'Place this text box in its own draggable canvas section.'}
									</span>
									<button
										type="button"
										className="btn-secondary text-placement-button"
										onClick={() => editor.setTextLayout(pageKey, block.id, textLayoutAtCanvasBottom(block))}
									>
										Place on canvas
									</button>
								</div>
							)
						)}
					</div>
				);
			}
			case 'embed': {
				const isBuy = !!stripePaymentLink(block.url);
				const invalid = !!block.url.trim() && !videoEmbedSrc(block.url) && !isBuy;
				const videoLabel = `video block ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Video</span>
							{controls(index, block, true)}
						</div>
						<input
							className={`text-input ${invalid ? 'invalid' : ''}`}
							aria-label={`YouTube, Vimeo or Stripe link for ${videoLabel}`}
							placeholder="Paste a YouTube, Vimeo or Stripe payment link (https://…)"
							value={block.url}
							onChange={(e) => editor.updateEmbedBlock(pageKey, block.id, e.target.value)}
						/>
						{invalid ? (
							<span className="field-error">That doesn’t look like a YouTube, Vimeo or Stripe payment link.</span>
						) : block.layout ? (
							<p className="muted">
								Placed on the canvas — drag it to move, drag its corner handle to resize.{' '}
								<button
									type="button"
									className="btn-link"
									onClick={() => editor.setEmbedLayout(pageKey, block.id, undefined)}
								>
									Back to normal flow
								</button>
							</p>
						) : hasFreeCanvas && !!block.url.trim() ? (
							<p className="muted">Drag this video in the preview to place it anywhere on the canvas.</p>
						) : (
							<p className="muted">The video plays right on your page.</p>
						)}
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
											label={`${hasFreeCanvas ? 'main canvas' : 'main images'} on ${pageName}`}
											onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)}
											onAdopt={() =>
												void adoptGridAsFreeform(page.gallery!, (patch) => editor.setGalleryConfig(pageKey, patch))
											}
										/>
									)}
									{(phoneItemsFor(page.gallery, hasFreeCanvas).length > 0 || page.gallery.mobile) && (
										<MobileArrangementEditor
											items={phoneItemsFor(page.gallery, hasFreeCanvas)}
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
							<span className="block-label">Divider line</span>
							{controls(index, block, true)}
						</div>
						<hr />
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
							<span className="block-label">Products</span>
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
										: 'Choose and order the products shown in this block. Draft products stay hidden when published.'}
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

			<div className="page-editor-group page-content-group" ref={pageContentRef}>
				<div className="page-content-heading">
					<h3>Content</h3>
					<details className="page-add-block" ref={addMenuRef}>
						<summary className="btn-primary" aria-label={`Add a block to ${pageName}`}>
							＋ Add block
						</summary>
						<div className="page-add-block-menu">
							{addBlockMenuItems()}
						</div>
					</details>
				</div>
				{blocks.map((block, index) => (
					<div key={block.id} data-editor-block={block.id}>
						{renderBlock(block, index)}
					</div>
				))}
			</div>
			{!nested && (
				<details className="page-add-block floating-add-block" ref={floatingAddMenuRef}>
					<summary className="floating-add-button" aria-label={`Add a block to ${pageName}`} title="Add block">
						＋
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
						<small>Page colors and phone arrangement</small>
					</span>
					<span className="page-editor-advanced-chevron" aria-hidden="true">⌄</span>
				</summary>
				<div className="page-editor-advanced-body">
					<Field
						label="Background colors"
						hint="Color the whole page, or give only the heading its own band. Text contrast adjusts automatically."
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
