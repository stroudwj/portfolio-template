import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import Hero from './Hero';
import Gallery, { type CarouselWidget } from './Gallery';
import About from './About';
import TextBlock from './TextBlock';
import { type InlineTextEditing } from './InlineTextEditor';
import Embed from './Embed';
import ScrollShots from './ScrollShots';
import ContactForm from './ContactForm';
import AccordionBlock from './AccordionBlock';
import ContactBlock from './ContactBlock';
import { PortfolioButton, PortfolioDivider } from './PageBlocks';
import Products from './Products';
import ChildPages from './ChildPages';
import Signature from './Signature';
import Footer from './Footer';
import SectionMotionRuntime from './SectionMotion';
import { resolveSiteMotion, siteSectionMotion } from './siteMotion';
import SectionResizeHandle, {
	responsiveHeightVars,
	type SectionBreakpoint,
} from './SectionResizeHandle';
import {
	stripSlashes,
	withBase,
	type CanvasEmbed,
	type CanvasLayoutUpdates,
	type CanvasSelection,
	type CanvasText,
	type PortfolioData,
	type TextFlowLayout,
	type TextLayout,
} from './types';
import { backgroundBlockVars } from './theme';
import {
	bottomOf,
	clampLayout,
	clampTextLayout,
	EMBED_AR,
	MIN_EMBED_W,
	MIN_TEXT_W,
	roundLayout,
	roundTextLayout,
	textBottom,
} from './canvasLayout';
import type { ChildPageItem, ImageLayout, PageBlock } from '../lib/content';
import type { CanvasWidget } from './CanvasGallery';
import { pageSections, sectionPartKey } from '../lib/pageSections';
import { sharedPageTransitionName } from './pageTransitions';
import ProjectDetails from './ProjectDetails';
import { embedKindLabel, embedSpec } from './mediaEmbed';

export interface PortfolioPageProps extends PortfolioData {
	/** Page key: 'home', a nav path like 'art', or a nested path like 'work/project-a'. */
	page: string;
	base: string;
	/** Editor preview: switch pages in place instead of following real links. */
	onNavigate?: (path: string) => void;
	/** Editor preview: makes gallery images movable/resizable and reports changes. */
	onImageLayout?: (folder: string, imageId: string, layout: ImageLayout) => void;
	/** Editor preview: moves/resizes the About photo on its own freeform canvas. */
	onProfileImageLayout?: (layout: ImageLayout) => void;
	/** Editor preview: moves/resizes the About words and links separately. */
	onProfileContentLayout?: (layout: ImageLayout) => void;
	/** Editor preview: reports a text block placed/moved on the page canvas. */
	onTextLayout?: (page: string, blockId: string, layout: TextLayout) => void;
	/** Editor preview: reports a hosted player/map placed or moved on the page canvas. */
	onEmbedLayout?: (page: string, blockId: string, layout: ImageLayout) => void;
	/** Editor preview: resizes or positions a hosted player/map in normal flow. */
	onEmbedFlowLayout?: (page: string, blockId: string, layout: TextFlowLayout) => void;
	/** Editor preview: commits a mixed image/text/embed canvas move atomically. */
	onCanvasLayouts?: (
		page: string,
		folder: string,
		updates: CanvasLayoutUpdates,
	) => void;
	/** Editor preview: removes selected freeform content in one undo step. */
	onDeleteCanvasItems?: (
		page: string,
		folder: string,
		selection: CanvasSelection,
	) => void;
	onCarouselFrame?: (page: string, blockId: string, layout: ImageLayout) => void;
	onWidgetLayout?: (page: string, blockId: string, layout: ImageLayout) => void;
	onChildItemLayout?: (page: string, blockId: string, itemId: string, layout: ImageLayout) => void;
	/** Editor preview: rename a sub-page card by editing its label in place. */
	onChildCardLabel?: (page: string, blockId: string, itemId: string, label: string) => void;
	onCarouselHost?: (
		page: string,
		blockId: string,
		hostId: string | undefined,
		layout?: ImageLayout,
	) => void;
	onCarouselFocus?: (folder: string, imageId: string, focusX: number, focusY: number) => void;
	onCarouselZoom?: (folder: string, imageId: string, zoom: number) => void;
	/** Editor preview: responsive minimum-height editing for page sections. */
	resizeBreakpoint?: SectionBreakpoint;
	onSectionHeight?: (
		page: string,
		partKey: string,
		breakpoint: SectionBreakpoint,
		height: number | undefined,
		viewportHeight?: number,
		gap?: number,
		recordHistory?: boolean,
	) => void;
	onFooterHeight?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
	onFooterImageLayout?: (layout: ImageLayout) => void;
	/** Editor preview: directly moves the optional page heading in freeform mode. */
	onPageHeadingPosition?: (x: number, y: number) => void;
	/** Show editor-only guidance for empty portfolio content. */
	editorPreview?: boolean;
	/** Editor preview: the text block currently being edited in place. */
	inlineTextEditing?: InlineTextEditing;
	onSelectBlock?: (pageKey: string, blockId: string) => void;
}

/** Where a flow block was released, in canvas-width % of the page's canvas. */
interface DropBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Resolve a button URL to an editor page without hijacking external links. */
function previewPageKey(url: string, base: string, pages: PortfolioData['content']['pages']): string | undefined {
	const value = url.trim();
	if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value)) return undefined;
	let path = stripSlashes(value.split(/[?#]/, 1)[0]);
	const basePath = stripSlashes(base);
	if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) path = stripSlashes(path.slice(basePath.length));
	const key = path || 'home';
	return pages[key] ? key : undefined;
}

/** Root-relative links authored as “/work” must stay inside a GitHub Pages
 * subfolder too; absolute web links and same-page # links pass through. */
function siteHref(url: string | undefined, base: string): string | undefined {
	return url?.startsWith('/') && !url.startsWith('//') ? withBase(base, url) : url;
}

/**
 * Editor-only wrapper that lets a flow block (text or embed) be dragged onto the
 * page's freeform canvas: it follows the pointer, and dropping it inside the
 * canvas reports an equivalent canvas placement (same spot it was released).
 */
function DraggableFlowBlock({
	children,
	boxSelector,
	onPlace,
	interactiveLabel,
}: {
	children: React.ReactNode;
	/** The visible box inside the wrapper (the wrapper spans full width). */
	boxSelector: string;
	onPlace: (box: DropBox) => void;
	/** Interactive embeds keep their iframe live and move from this editor-only grip. */
	interactiveLabel?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);

	const start = (e: React.PointerEvent) => {
		if (e.button !== 0) return;
		const el = ref.current;
		if (!el) return;
		// Prefer the canvas in this block's own section; several independent
		// freeform sections can coexist on one page.
		const root =
			el.closest('.portfolio-page-part') ??
			el.closest('.portfolio-root') ??
			document;
		const canvas =
			root.querySelector('[data-section-gallery] .canvas-gallery') ??
			root.querySelector('.canvas-gallery');
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The fixed drag shield below prevents hosted iframes taking the pointer.
		}
		const win = el.ownerDocument.defaultView ?? window;
		const startRect = el.getBoundingClientRect();
		const pointerOffset = {
			x: e.clientX - startRect.left,
			y: e.clientY - startRect.top,
		};
		let liveDelta = { x: 0, y: 0 };
		let lastPointer = { x: e.clientX, y: e.clientY };
		let moved = false;
		const update = (clientX: number, clientY: number) => {
			const visibleRect = el.getBoundingClientRect();
			const naturalLeft = visibleRect.left - liveDelta.x;
			const naturalTop = visibleRect.top - liveDelta.y;
			liveDelta = {
				x: clientX - pointerOffset.x - naturalLeft,
				y: clientY - pointerOffset.y - naturalTop,
			};
			if (Math.abs(liveDelta.x) + Math.abs(liveDelta.y) > 3) moved = true;
			setDelta(liveDelta);
		};
		const move = (ev: PointerEvent) => {
			lastPointer = { x: ev.clientX, y: ev.clientY };
			update(ev.clientX, ev.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = (ev: PointerEvent) => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already be released after cancellation.
			}
			const box = (el.querySelector(boxSelector) ?? el).getBoundingClientRect();
			setDelta(null);
			if (!moved) return;
			const rect = canvas.getBoundingClientRect();
			if (!rect.width) return;
			// Only pin when the pointer lets go inside the canvas; otherwise snap back.
			if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom)
				return;
			const scale = 100 / rect.width; // px -> canvas-width %
			onPlace({
				x: (box.left - rect.left) * scale,
				y: (box.top - rect.top) * scale,
				w: box.width * scale,
				h: box.height * scale,
			});
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	return (
		<div
			ref={ref}
			className={`flow-text-draggable ${interactiveLabel ? 'flow-embed-draggable' : ''} ${delta ? 'dragging' : ''}`}
			style={delta ? { transform: `translate(${delta.x}px, ${delta.y}px)` } : undefined}
			onPointerDown={interactiveLabel ? undefined : start}
		>
			{interactiveLabel && (
				<button
					type="button"
					className="flow-embed-drag-handle"
					onPointerDown={start}
					title={`Drag ${interactiveLabel} onto the page canvas`}
				>
					<span aria-hidden="true">⠿</span> Drag {interactiveLabel}
				</button>
			)}
			{children}
			{delta && <div className="flow-embed-drag-shield" aria-hidden="true" />}
		</div>
	);
}

/**
 * Renders one page's body from resolved data as its ordered blocks (text, gallery,
 * sub-page cards, about). Shared by the Astro site (per-page) and the editor preview,
 * so the page composition lives in exactly one place. Content is always migrated
 * (migrateContent) before it gets here, so `blocks` is present.
 */
export default function PortfolioPage({
	page,
	content,
	galleries,
	profileImageSrc,
	pageThumbs,
	productImageSrcs,
	resumeHref,
	base,
	onNavigate,
	onImageLayout,
	onProfileImageLayout,
	onProfileContentLayout,
	onTextLayout,
	onEmbedLayout,
	onEmbedFlowLayout,
	onCanvasLayouts,
	onDeleteCanvasItems,
	onCarouselFrame,
	onWidgetLayout,
	onChildItemLayout,
	onChildCardLabel,
	onCarouselHost,
	onCarouselFocus,
	onCarouselZoom,
	resizeBreakpoint,
	onSectionHeight,
	onFooterHeight,
	onFooterImageLayout,
	onPageHeadingPosition,
	editorPreview = false,
	inlineTextEditing,
	onSelectBlock,
}: PortfolioPageProps) {
	const [pageHost, setPageHost] = useState<HTMLElement | null>(null);
	const [pageRoot, setPageRootState] = useState<HTMLDivElement | null>(null);
	const [isPhone, setIsPhone] = useState(false);
	const setPageRoot = useCallback((element: HTMLDivElement | null) => {
		setPageRootState(element);
		setPageHost(element ? element.ownerDocument.body : null);
	}, []);
	useEffect(() => {
		const win = pageHost?.ownerDocument.defaultView;
		if (!win) return;
		const query = win.matchMedia('(max-width: 639px)');
		const update = () => setIsPhone(query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, [pageHost]);
	const config = content.pages[page];
	if (!config) return null;
	const gallery = config.gallery;
	const imagesFor = (folder: string) =>
		(galleries[folder] ?? []).map((image) => {
			const link = siteHref(image.link, base);
			return link === image.link ? image : { ...image, link };
		});
	const images = gallery ? imagesFor(gallery.folder) : [];
	const imageLinkNavigate = onNavigate
		? (url: string, event: ReactMouseEvent<HTMLElement>) => {
				const target = previewPageKey(url, base, content.pages);
				if (!target) return;
				event.preventDefault();
				onNavigate(target === 'home' ? '' : target);
			}
		: undefined;
	const onLayoutChange =
		onImageLayout && gallery ? (id: string, layout: ImageLayout) => onImageLayout(gallery.folder, id, layout) : undefined;
	const textLayoutChange = onTextLayout ? (id: string, layout: TextLayout) => onTextLayout(page, id, layout) : undefined;
	const embedLayoutChange = onEmbedLayout ? (id: string, layout: ImageLayout) => onEmbedLayout(page, id, layout) : undefined;
	const embedFlowLayoutChange = onEmbedFlowLayout
		? (id: string, layout: TextFlowLayout) => onEmbedFlowLayout(page, id, layout)
		: undefined;
	const deleteFromCanvas = (folder: string) =>
		onDeleteCanvasItems
			? (selection: CanvasSelection) => onDeleteCanvasItems(page, folder, selection)
			: undefined;
	const selectInnerBlock = onSelectBlock ? (blockId: string) => onSelectBlock(page, blockId) : undefined;

	// Text and videos pin to the canvas only when the page renders one (freeform gallery).
	const blocks = config.blocks ?? [];
	const freeformHosts = blocks.flatMap((block) => {
		if (block.type === 'gallery' && gallery && gallery.layout !== 'grid')
			return [{ id: block.id }];
		if (block.type === 'images' && block.gallery.carousel !== true && block.gallery.layout !== 'grid')
			return [{ id: block.id }];
		return [];
	});
	const carouselHostById = new Map<string, string>();
	const hostedCarousels = new Map<string, CarouselWidget[]>();
	blocks.forEach((block) => {
		if (block.type !== 'images' || block.gallery.carousel !== true || !block.gallery.carouselHost) return;
		const host = freeformHosts.find((candidate) => candidate.id === block.gallery.carouselHost);
		if (!host) return;
		carouselHostById.set(block.id, host.id);
		const widget: CarouselWidget = {
			id: block.id,
			images: imagesFor(block.gallery.folder),
			settings: block.gallery,
			alt: block.gallery.alt,
			onFocusChange: onCarouselFocus
				? (imageId, focusX, focusY) =>
						onCarouselFocus(block.gallery.folder, imageId, focusX, focusY)
				: undefined,
			onZoomChange: onCarouselZoom
				? (imageId, zoom) => onCarouselZoom(block.gallery.folder, imageId, zoom)
				: undefined,
		};
		hostedCarousels.set(host.id, [...(hostedCarousels.get(host.id) ?? []), widget]);
	});
	const carouselHostChange = onCarouselHost
		? (blockId: string, hostId: string, layout: ImageLayout) =>
				onCarouselHost(page, blockId, hostId, layout)
		: undefined;
	const sections = pageSections(config);
	const blockById = new Map(blocks.map((block) => [block.id, block]));
	const canvasWidgetLayoutChange =
		onWidgetLayout || onCarouselFrame || onChildItemLayout
			? (blockId: string, layout: ImageLayout) => {
					const [ownerId, itemId] = blockId.split('::');
					if (itemId && blockById.get(ownerId)?.type === 'children') {
						onChildItemLayout?.(page, ownerId, itemId, layout);
						return;
					}
					if (blockById.get(blockId)?.type === 'images')
						onCarouselFrame?.(page, blockId, layout);
					else onWidgetLayout?.(page, blockId, layout);
				}
			: undefined;
	const sectionIdByBlock = new Map<string, string>();
	for (const section of sections)
		for (const blockId of section.blockIds)
			sectionIdByBlock.set(blockId, section.id);
	const freeformHostBySection = new Map<string, string>();
	for (const section of sections) {
		const host = section.blockIds
			.map((id) => blockById.get(id))
			.find(
				(block) =>
					(block?.type === 'gallery' && gallery?.layout !== 'grid') ||
					(block?.type === 'images' &&
						block.gallery.carousel !== true &&
						block.gallery.layout !== 'grid'),
			);
		if (host) freeformHostBySection.set(section.id, host.id);
	}
	const canvasTextsBySection = new Map<string, CanvasText[]>();
	const canvasEmbedsBySection = new Map<string, CanvasEmbed[]>();
	const canvasWidgetsBySection = new Map<string, CanvasWidget[]>();
	const childItemsFor = (block: Extract<PageBlock, { type: 'children' }>) =>
		(block.items ?? (config.children ?? []).map((key): ChildPageItem => ({ id: key, page: key }))).map((item) => ({
			id: item.id,
			key: item.page,
			label: item.label || content.pages[item.page]?.label || item.page,
			href: withBase(base, `${item.page}/`),
			thumbSrc: pageThumbs?.[item.page],
			layout: item.layout,
		}));
	for (const section of sections) {
		const sectionBlocks = section.blockIds
			.map((id) => blockById.get(id))
			.filter((block): block is PageBlock => !!block);
		canvasTextsBySection.set(
			section.id,
			sectionBlocks.flatMap((block) =>
				block.type === 'text' && block.layout
					? [{
							id: block.id,
							text: block.text,
							richText: block.richText,
							fontFamily: block.fontFamily,
							align: block.align,
							style: block.style,
							link: siteHref(block.link, base),
							kinetic: block.kinetic,
							kineticTarget: `block:${block.id}`,
							layout: block.layout,
						}]
					: [],
			),
		);
		canvasEmbedsBySection.set(
			section.id,
			sectionBlocks.flatMap((block) =>
				block.type === 'embed' && block.layout
					? [{ id: block.id, url: block.url, kind: block.kind, layout: block.layout }]
					: [],
			),
		);
		canvasWidgetsBySection.set(
			section.id,
			sectionBlocks.flatMap((block): CanvasWidget[] => {
				if (block.type === 'children') {
					const childItems = childItemsFor(block);
					// The whole block hangs on the canvas as one widget unless individual
					// cards have their own layouts. (This must not require the legacy
					// no-`items` shape — modern children blocks always carry items.)
					const editCardLabel = onChildCardLabel
						? (itemId: string, label: string) => onChildCardLabel(page, block.id, itemId, label)
						: undefined;
					if (block.canvasLayout && !childItems.some((item) => item.layout))
						return [{
							id: block.id,
							layout: block.canvasLayout,
							freeResize: true,
							autoHeight: true,
							dragLabel: 'Click and drag sub-pages',
							content: <ChildPages items={childItems} style={block.style} onNavigate={onNavigate} pageTransition={content.site.creative?.pageTransition} onEditLabel={editCardLabel} />,
						}];
					return childItems.flatMap((item) => item.layout ? [{
						id: `${block.id}::${item.id}`,
						layout: item.layout,
						freeResize: true,
						autoHeight: true,
						dragLabel: `Click and drag ${item.label}`,
						content: (
							<ChildPages
								items={[item]}
								style={block.style}
								onNavigate={onNavigate}
								pageTransition={content.site.creative?.pageTransition}
								onEditLabel={editCardLabel}
							/>
						),
					}] : []);
				}
				if (block.type === 'divider' && block.layout)
					return [{
						id: block.id,
						layout: block.layout,
						freeResize: true,
						dragLabel: 'Click and drag divider',
						content: (
							<PortfolioDivider
								style={block.style}
								width={block.width}
								color={block.color}
							/>
						),
					}];
				if (block.type === 'products' && block.canvasLayout && content.store)
					return [{
						id: block.id,
						layout: block.canvasLayout,
						freeResize: true,
						autoHeight: true,
						content: (
							<Products
								store={content.store}
								productImageSrcs={productImageSrcs}
								productIds={block.productIds}
								layout={block.layout}
								locale={content.site.language}
							/>
						),
					}];
				if (block.type === 'project' && block.layout)
					return [{
						id: block.id,
						layout: block.layout,
						freeResize: true,
						dragLabel: 'Click and drag project fields',
						content: <ProjectDetails project={block.project} labels={block.labels} order={block.order} fontFamily={block.fontFamily} fontSize={block.fontSize} />,
					}];
				if (block.type === 'form' && block.layout)
					return [{
						id: block.id,
						layout: block.layout,
						freeResize: false,
						dragLabel: 'Click and drag contact form',
						content: (
							<ContactForm
								heading={block.heading}
								action={block.action}
								fallbackEmail={block.recipientEmail}
								successMessage={block.successMessage}
								fields={block.fields.map((field) => ({
									name: field.id,
									type: field.type,
									label: field.label,
									required: field.required,
								}))}
							/>
						),
					}];
				return [];
			}),
		);
	}
	const standaloneCanvasAnchor = new Map<string, string>();
	const autoFlowFloorByHost = new Map<string, number>();
	for (const section of sections) {
		const hostId = freeformHostBySection.get(section.id);
		if (hostId) {
			let floor = 0;
			for (const id of section.blockIds) {
				if (id === hostId) break;
				const block = blockById.get(id);
				if (block?.type === 'text' && block.layout)
					floor = Math.max(floor, textBottom(block.layout) + 2.5);
				if (block?.type === 'embed' && block.layout)
					floor = Math.max(floor, bottomOf(block.layout) + 2.5);
			}
			autoFlowFloorByHost.set(hostId, floor);
		}
		if (freeformHostBySection.has(section.id)) continue;
		const anchor = section.blockIds.find((id) => {
			const block = blockById.get(id);
			return (
				((block?.type === 'text' || block?.type === 'embed' || block?.type === 'divider') && !!block.layout) ||
				(block?.type === 'children' && (!!block.canvasLayout || (block.items ?? []).some((item) => !!item.layout))) ||
				(block?.type === 'products' && !!block.canvasLayout) ||
				(block?.type === 'project' && !!block.layout) ||
				(block?.type === 'form' && !!block.layout)
			);
		});
		if (anchor) standaloneCanvasAnchor.set(section.id, anchor);
	}
	const pageOrder = new Map((config.mobile?.order ?? []).map((key, index) => [key, index]));
	const automaticPageKeys = [
		...(config.heading?.trim() ? ['page:heading'] : []),
		...(config.project ? ['page:project'] : []),
		...sections.map((section) => sectionPartKey(section.id)),
	];
	const automaticPageOrder = new Map(automaticPageKeys.map((key, index) => [key, index]));
	const automaticContrast = content.theme.automaticTextContrast !== false;
	const siteMotion = resolveSiteMotion(content.theme.motion);
	const pagePartVars = (key: string, isFirst: boolean): CSSProperties => {
		return {
			'--phone-page-order': String(pageOrder.get(key) ?? pageOrder.size + (automaticPageOrder.get(key) ?? 0)),
			'--phone-page-display': config.mobile?.items?.[key]?.hidden ? 'none' : 'flow-root',
			...responsiveHeightVars(config.sectionHeights?.[key], isFirst),
		} as CSSProperties;
	};
	const renderBlock = (block: PageBlock) => {
		const sectionId = sectionIdByBlock.get(block.id) ?? sections[0]?.id ?? 'main';
		const canvasHostId = freeformHostBySection.get(sectionId);
		const hasCanvas = !!canvasHostId;
		const canvasTexts = canvasTextsBySection.get(sectionId) ?? [];
		const canvasEmbeds = canvasEmbedsBySection.get(sectionId) ?? [];
		const canvasWidgets = canvasWidgetsBySection.get(sectionId) ?? [];
		switch (block.type) {
			case 'text':
				// Pinned texts render inside the canvas instead of the page flow.
				if (hasCanvas && block.layout) return null;
				if (block.layout) {
					if (standaloneCanvasAnchor.get(sectionId) !== block.id) return null;
					return (
						<div
							key={block.id}
							className={`page-content-wrapper standalone-text-box-canvas${
								canvasEmbeds.length ? ' standalone-embed-canvas' : ''
							}`}
						>
							<Gallery
								images={[]}
								texts={canvasTexts}
							inlineTextEditing={inlineTextEditing}
								embeds={canvasEmbeds}
								editable={!!textLayoutChange}
								onTextLayout={textLayoutChange}
								onEmbedLayout={embedLayoutChange}
								onDeleteSelection={deleteFromCanvas('')}
								onSelectBlock={selectInnerBlock}
							/>
						</div>
					);
				}
				// While its words are edited in place, the block leaves the
				// drag-to-canvas wrapper so the caret owns every pointer event.
				return textLayoutChange && hasCanvas && inlineTextEditing?.blockId !== block.id ? (
					<DraggableFlowBlock
						key={block.id}
						boxSelector=".text-block-content"
						onPlace={(box) =>
							textLayoutChange(
								block.id,
								roundTextLayout(
									clampTextLayout({ x: box.x, y: box.y, w: Math.min(Math.max(box.w, MIN_TEXT_W), 100), h: box.h }),
								),
							)
						}
					>
						<TextBlock
							text={block.text}
							richText={block.richText}
							fontFamily={block.fontFamily}
							align={block.align}
							style={block.style}
							link={siteHref(block.link, base)}
							kinetic={block.kinetic}
							flowLayout={block.flowLayout}
							kineticTarget={`block:${block.id}`}
						/>
					</DraggableFlowBlock>
				) : (
					<TextBlock
						key={block.id}
						text={block.text}
						richText={block.richText}
						fontFamily={block.fontFamily}
						align={block.align}
						style={block.style}
						link={siteHref(block.link, base)}
						kinetic={block.kinetic}
						flowLayout={block.flowLayout}
						kineticTarget={`block:${block.id}`}
						editing={inlineTextEditing?.blockId === block.id ? inlineTextEditing : undefined}
					/>
				);
			case 'embed':
				// Pinned embeds render inside the primary canvas instead of page flow.
				if (hasCanvas && block.layout) return null;
				if (block.layout) {
					if (standaloneCanvasAnchor.get(sectionId) !== block.id) return null;
					return (
						<div
							key={block.id}
							className={`page-content-wrapper standalone-embed-canvas${
								canvasTexts.length ? ' standalone-text-box-canvas' : ''
							}`}
						>
							<Gallery
								images={[]}
								texts={canvasTexts}
							inlineTextEditing={inlineTextEditing}
								embeds={canvasEmbeds}
								editable={!!embedLayoutChange}
								onTextLayout={textLayoutChange}
								onEmbedLayout={embedLayoutChange}
								onDeleteSelection={deleteFromCanvas('')}
								onSelectBlock={selectInnerBlock}
							/>
						</div>
					);
				}
				return embedLayoutChange && hasCanvas && block.url.trim() ? (
					<DraggableFlowBlock
						key={block.id}
						boxSelector=".embed-block"
						interactiveLabel={
							embedSpec(block.url)?.provider ?? embedKindLabel(block.kind ?? 'video')
						}
						onPlace={(box) =>
							embedLayoutChange(
								block.id,
								roundLayout(
									clampLayout({
										x: box.x,
										y: box.y,
										w: Math.min(Math.max(box.w, MIN_EMBED_W), 100),
										ar: embedSpec(block.url)?.aspectRatio ?? EMBED_AR,
									}),
								),
							)
						}
					>
						<Embed
							url={block.url}
							kind={block.kind}
							flowLayout={block.flowLayout}
							editable={!!embedFlowLayoutChange}
							onFlowLayout={
								embedFlowLayoutChange
									? (layout) => embedFlowLayoutChange(block.id, layout)
									: undefined
							}
						/>
					</DraggableFlowBlock>
				) : (
					<Embed
						key={block.id}
						url={block.url}
						kind={block.kind}
						flowLayout={block.flowLayout}
						editable={!!embedFlowLayoutChange}
						onFlowLayout={
							embedFlowLayoutChange
								? (layout) => embedFlowLayoutChange(block.id, layout)
								: undefined
						}
					/>
				);
			case 'shots': {
				const value = block.assetId ? block.src : block.src.trim();
				const source =
					/^(?:https?:|blob:)/i.test(value)
						? value
						: value && !value.startsWith('//')
							? withBase(base, value)
							: undefined;
				return (
					<ScrollShots
						key={block.id}
						src={source}
						scrollLength={block.scrollLength}
						fadeIntoPage={block.fadeIntoPage !== false}
						fadeStart={block.fadeStart}
						fadeDuration={block.fadeDuration}
						fit={block.fit}
						phone={block.phone}
						editorPreview={editorPreview}
					/>
				);
			}
			case 'about': {
				const resume =
					resumeHref || (content.resume && content.resume.url)
						? { label: content.resume?.label || 'Résumé', href: resumeHref ?? withBase(base, content.resume.url) }
						: null;
				const aboutContent = (
					<About
						name={content.profile.name ?? content.site.name}
						bio={content.profile.bio}
						bioRichText={content.profile.bioRichText}
						bioFontFamily={content.profile.bioFontFamily}
						email={content.contact.email}
						social={content.social}
						profileImageSrc={content.profile.imageLayout ? undefined : profileImageSrc}
						imageWidth={content.profile.imageWidth}
						imageAspect={content.profile.imageAspect}
						imageFocusX={content.profile.imageFocusX}
						imageFocusY={content.profile.imageFocusY}
						imageCropZoom={content.profile.imageCropZoom}
						profileImageFreeform={!!content.profile.imageLayout}
						resume={resume}
						editorPreview={editorPreview}
					/>
				);
				if (!profileImageSrc || !content.profile.imageLayout) return <div key={block.id}>{aboutContent}</div>;
				return (
					<div className="about-freeform-composition" key={block.id}>
						<Gallery
							images={[{
								id: '__about-photo__',
								src: profileImageSrc,
								alt: content.profile.name || content.site.name || 'About photo',
								layout: content.profile.imageLayout,
								focusX: content.profile.imageFocusX,
								focusY: content.profile.imageFocusY,
								cropAspect: content.profile.imageAspect,
								cropZoom: content.profile.imageCropZoom,
							}]}
							canvasWidgets={content.profile.contentLayout ? [{
								id: `${block.id}::about-content`,
								layout: content.profile.contentLayout,
								freeResize: true,
								dragLabel: 'Click and drag About text',
								content: aboutContent,
							}] : undefined}
							alt="About photo"
							editable={!!onProfileImageLayout || !!onProfileContentLayout}
							onLayoutChange={onProfileImageLayout ? (_id, layout) => onProfileImageLayout(layout) : undefined}
							onCarouselWidgetLayout={onProfileContentLayout ? (_id, layout) => onProfileContentLayout(layout) : undefined}
							onSelectBlock={selectInnerBlock}
						/>
						{!content.profile.contentLayout && aboutContent}
					</div>
				);
			}
			case 'children': {
				const childItems = childItemsFor(block);
				// Rendered as one whole-block canvas widget instead (see
				// canvasWidgetsBySection) — nothing left for the page flow.
				if (hasCanvas && block.canvasLayout && !childItems.some((item) => item.layout))
					return null;
				const flowingItems = childItems.filter((item) => !item.layout);
				if (!flowingItems.length) return null;
				return (
					<ChildPages
						key={block.id}
						items={flowingItems}
						style={block.style}
						onNavigate={onNavigate}
						pageTransition={content.site.creative?.pageTransition}
						onEditLabel={
							onChildCardLabel
								? (itemId, label) => onChildCardLabel(page, block.id, itemId, label)
								: undefined
						}
					/>
				);
			}
			case 'products':
				if (!content.store) return null;
				if (hasCanvas && block.canvasLayout) return null;
				return (
					<Products
						key={block.id}
						store={content.store}
						productImageSrcs={productImageSrcs}
						productIds={block.productIds}
						layout={block.layout}
						locale={content.site.language}
					/>
				);
			case 'project':
				if (hasCanvas && block.layout) return null;
				return <ProjectDetails key={block.id} project={block.project} labels={block.labels} order={block.order} fontFamily={block.fontFamily} fontSize={block.fontSize} />;
			case 'gallery': {
				const sharedTransitionStyle =
					content.site.creative?.pageTransition === 'gallery'
						? ({ viewTransitionName: sharedPageTransitionName(page) } as CSSProperties)
						: undefined;
				const galleryEl = (
					<Gallery
						images={images}
						alt={gallery?.alt}
						settings={gallery}
						autoFlowFloor={autoFlowFloorByHost.get(block.id)}
						texts={canvasHostId === block.id ? canvasTexts : undefined}
						inlineTextEditing={inlineTextEditing}
						embeds={canvasHostId === block.id ? canvasEmbeds : undefined}
						carouselWidgets={hostedCarousels.get(block.id)}
						canvasWidgets={canvasHostId === block.id ? canvasWidgets : undefined}
						editable={!!onLayoutChange}
						onLayoutChange={onLayoutChange}
						onTextLayout={textLayoutChange}
						onEmbedLayout={embedLayoutChange}
						onCarouselWidgetLayout={canvasWidgetLayoutChange}
						onBulkLayoutChange={
							onCanvasLayouts && gallery
								? (updates) => onCanvasLayouts(page, gallery.folder, updates)
								: undefined
						}
						onDeleteSelection={gallery ? deleteFromCanvas(gallery.folder) : undefined}
						onImageLink={imageLinkNavigate}
						onSelectBlock={selectInnerBlock}
					/>
				);
				// Home keeps its collage layout; other pages the standard wrapper (the
				// page-photo modifier preserves the original photography page's spacing).
				return page === 'home' ? (
					<div
						key={block.id}
						className="collage-container"
						data-primary-gallery
						data-section-gallery={canvasHostId === block.id ? sectionId : undefined}
						data-carousel-canvas-host={gallery?.layout !== 'grid' ? block.id : undefined}
						style={sharedTransitionStyle}
					>
						{galleryEl}
					</div>
				) : (
					<div
						key={block.id}
						className={`page-content-wrapper ${page === 'photography' ? 'page-photo' : ''}`}
						data-primary-gallery
						data-section-gallery={canvasHostId === block.id ? sectionId : undefined}
						data-carousel-canvas-host={gallery?.layout !== 'grid' ? block.id : undefined}
						style={sharedTransitionStyle}
					>
						{galleryEl}
					</div>
				);
			}
			case 'images': {
				// An extra self-contained image group: its own folder, layout mode and
				// (in the editor) its own drag-anywhere canvas. Pinned text/video stays
				// with the primary gallery above, so this block passes none.
				const groupImages = imagesFor(block.gallery.folder);
				if (carouselHostById.has(block.id)) return null;
				return (
					<div
						key={block.id}
						className="page-content-wrapper image-group"
						data-carousel-canvas-host={
							block.gallery.carousel !== true && block.gallery.layout !== 'grid'
								? block.id
								: undefined
						}
						data-section-gallery={canvasHostId === block.id ? sectionId : undefined}
					>
						<Gallery
							images={groupImages}
							alt={block.gallery.alt}
							settings={block.gallery}
							autoFlowFloor={autoFlowFloorByHost.get(block.id)}
							texts={canvasHostId === block.id ? canvasTexts : undefined}
						inlineTextEditing={inlineTextEditing}
							embeds={canvasHostId === block.id ? canvasEmbeds : undefined}
							carouselWidgets={hostedCarousels.get(block.id)}
							canvasWidgets={canvasHostId === block.id ? canvasWidgets : undefined}
							editable={!!onImageLayout}
							onLayoutChange={
								onImageLayout ? (id, layout) => onImageLayout(block.gallery.folder, id, layout) : undefined
							}
							onTextLayout={
								canvasHostId === block.id ? textLayoutChange : undefined
							}
							onEmbedLayout={
								canvasHostId === block.id ? embedLayoutChange : undefined
							}
							onBulkLayoutChange={
								onCanvasLayouts
									? (updates) => onCanvasLayouts(page, block.gallery.folder, updates)
									: undefined
							}
							onDeleteSelection={deleteFromCanvas(block.gallery.folder)}
							onCarouselWidgetLayout={canvasWidgetLayoutChange}
							onCarouselFrameChange={
								onCarouselFrame ? (layout) => onCarouselFrame(page, block.id, layout) : undefined
							}
							onCarouselHostChange={
								carouselHostChange
									? (hostId, layout) => carouselHostChange(block.id, hostId, layout)
									: undefined
							}
							onCarouselFocusChange={
								onCarouselFocus
									? (id, focusX, focusY) => onCarouselFocus(block.gallery.folder, id, focusX, focusY)
									: undefined
							}
							onCarouselZoomChange={onCarouselZoom ? (id, zoom) => onCarouselZoom(block.gallery.folder, id, zoom) : undefined}
							onDeleteCarousel={
								block.gallery.carousel === true && onDeleteCanvasItems
									? () =>
											onDeleteCanvasItems(page, block.gallery.folder, {
												widgets: [block.id],
											})
									: undefined
							}
							onImageLink={imageLinkNavigate}
							onSelectBlock={selectInnerBlock}
						/>
					</div>
				);
			}
			case 'button': {
				const previewTarget = onNavigate ? previewPageKey(block.url, base, content.pages) : undefined;
				return (
					<PortfolioButton
						key={block.id}
						label={block.label}
						url={siteHref(block.url, base) ?? block.url}
						align={block.align}
						appearance={block.appearance}
						onClick={
							previewTarget && onNavigate
								? (event) => {
										event.preventDefault();
										onNavigate(previewTarget === 'home' ? '' : previewTarget);
									}
								: undefined
						}
					/>
				);
			}
			case 'divider':
				if (hasCanvas && block.layout) return null;
				if (block.layout) {
					if (standaloneCanvasAnchor.get(sectionId) !== block.id) return null;
					return (
						<div key={block.id} className="page-content-wrapper standalone-widget-canvas">
							<Gallery
								images={[]}
								canvasWidgets={canvasWidgets}
								editable={!!canvasWidgetLayoutChange}
								onCarouselWidgetLayout={canvasWidgetLayoutChange}
								onSelectBlock={selectInnerBlock}
							/>
						</div>
					);
				}
				return (
					<PortfolioDivider
						key={block.id}
						style={block.style}
						width={block.width}
						color={block.color}
					/>
				);
			case 'contact':
				return (
					<ContactBlock
						key={block.id}
						heading={block.heading}
						text={block.text}
						email={block.email}
						buttonLabel={block.buttonLabel}
						editorPreview={editorPreview}
					/>
				);
			case 'accordion':
				return (
					<AccordionBlock
						key={block.id}
						blockId={block.id}
						items={block.items}
						titleSize={block.titleSize}
						fontFamily={block.fontFamily}
						editorPreview={editorPreview}
					/>
				);
			case 'form':
				if (hasCanvas && block.layout) return null;
				return (
					<ContactForm
						key={block.id}
						heading={block.heading}
						action={block.action}
						fallbackEmail={block.recipientEmail}
						successMessage={block.successMessage}
						fields={block.fields.map((field) => ({
							name: field.id,
							type: field.type,
							label: field.label,
							required: field.required,
						}))}
					/>
				);
		}
	};
	const hasPageHeading = !!config.heading?.trim();
	const keepsEmptyHeadingBand =
		!!config.sectionHeights?.['page:heading'] ||
		!!(resizeBreakpoint && onSectionHeight);
	const pageParts = [
		...(hasPageHeading || keepsEmptyHeadingBand
			? [{
					key: 'page:heading',
					className: `portfolio-page-heading${hasPageHeading ? '' : ' is-empty-page-heading'}`,
					shotsLength: undefined,
					shotsFadeStart: undefined,
					locksSectionEdge: false,
					rendered: hasPageHeading ? (
						<Hero
							heading={config.heading}
							position={content.theme.pageHeadingPosition}
							freeformX={content.theme.pageHeadingX}
							freeformY={content.theme.pageHeadingY}
							onPositionChange={onPageHeadingPosition}
							kinetic={config.headingKinetic}
						/>
					) : <div className="empty-page-heading-band" aria-hidden="true" />,
				}]
			: []),
		...(config.project
			? [{
					key: 'page:project',
					className: 'portfolio-project-details',
					shotsLength: undefined,
					shotsFadeStart: undefined,
					locksSectionEdge: false,
					rendered: <ProjectDetails project={config.project} />,
				}]
			: []),
		...sections.flatMap((section) => {
			const sectionBlocks = section.blockIds
				.map((id) => blockById.get(id))
				.filter((block): block is PageBlock => !!block);
			const renderedByBlock = sectionBlocks
				.map((block, blockIndex) => {
					const renderedBlock = renderBlock(block);
					return renderedBlock ? (
						<div
							className="preview-block-boundary"
							data-preview-page={page}
							data-preview-block={block.id}
							style={{ zIndex: sectionBlocks.length - blockIndex }}
							key={block.id}
						>
							{renderedBlock}
						</div>
					) : null;
				})
				.filter((node): node is NonNullable<typeof node> => node !== null);
			if (!renderedByBlock.length) return [];
			const canvasHostId = freeformHostBySection.get(section.id);
			const canvasHostIndex = canvasHostId
				? sectionBlocks.findIndex((block) => block.id === canvasHostId)
				: -1;
			const canvasRendered = canvasHostIndex >= 0 ? renderedByBlock.find((node) => node.key === canvasHostId) : undefined;
			// Collection blocks (sub-pages, products) that are NOT pinned to the
			// canvas render AFTER the composition: the mixed grid stacks its flow
			// layer over the canvas, which composits text fine but leaves card
			// collections unreadably overlapping the art.
			const belowCanvasIds = canvasRendered
				? new Set(
						sectionBlocks
							.filter(
								(block) =>
									(block.type === 'children' || block.type === 'products') &&
									!block.canvasLayout,
							)
							.map((block) => block.id),
					)
				: new Set<string>();
			const flowRendered = canvasRendered
				? renderedByBlock.filter(
						(node) => node !== canvasRendered && !belowCanvasIds.has(String(node.key)),
					)
				: renderedByBlock;
			const belowRendered = canvasRendered
				? renderedByBlock.filter((node) => belowCanvasIds.has(String(node.key)))
				: [];
			const rendered = canvasRendered && (flowRendered.length || belowRendered.length) ? (
				<>
					{flowRendered.length ? (
						<div className="section-mixed-composition">
							<div className="section-flow-layer">{flowRendered}</div>
							<div
								className="section-canvas-layer"
								style={{ zIndex: sectionBlocks.length - canvasHostIndex }}
							>{canvasRendered}</div>
						</div>
					) : (
						canvasRendered
					)}
					{belowRendered}
				</>
			) : <>{renderedByBlock}</>;
			const shots = sectionBlocks.find(
				(block): block is Extract<PageBlock, { type: 'shots' }> =>
					block.type === 'shots',
			);
			const standaloneCanvas =
				!freeformHostBySection.has(section.id) &&
				sectionBlocks.some(
					(block) =>
						(block.type === 'text' || block.type === 'embed') && !!block.layout,
				);
			return [{
				key: sectionPartKey(section.id),
				className: `portfolio-page-block section-container${
					shots
						? ` shots-page-part${shots.fadeIntoPage !== false ? ' shots-fade-page' : ''}`
						: ''
				}${standaloneCanvas ? ' standalone-canvas-page-part' : ''}`,
				rendered,
				shotsLength: shots?.scrollLength ?? (shots ? 260 : undefined),
				shotsFadeStart: shots?.fadeStart ?? (shots ? 70 : undefined),
				locksSectionEdge: standaloneCanvas,
			}];
		}),
	];
	if (isPhone && config.mobile)
		pageParts.sort(
			(a, b) =>
				(pageOrder.get(a.key) ?? pageOrder.size + (automaticPageOrder.get(a.key) ?? 0)) -
				(pageOrder.get(b.key) ?? pageOrder.size + (automaticPageOrder.get(b.key) ?? 0)),
		);

	return (
		<>
			<SectionMotionRuntime
				root={pageRoot}
				signature={JSON.stringify([config.sectionMotion ?? {}, content.theme.motion ?? null])}
			/>
			<div
				ref={setPageRoot}
				className={`portfolio-page-body page-${page === 'home' ? 'home' : 'inner'} ${hasPageHeading ? 'has-page-heading' : 'without-page-heading'}`}
				data-phone-ready={isPhone ? 'true' : undefined}
			>
				{pageParts.map((part, partIndex) => {
					const sectionColor = config.sectionColors?.[part.key];
					// Hand-authored per-section motion wins; otherwise the site vocabulary
					// applies. Shots sections choreograph their own scroll (sticky inside a
					// transformed wrapper would break), so they never inherit site motion.
					const motion =
						config.sectionMotion?.[part.key] ??
						(part.shotsLength === undefined
							? siteSectionMotion(siteMotion, partIndex === 0)
							: undefined);
					const strength = Math.min(Math.max(motion?.intensity ?? 45, 1), 100);
					const partStyle = {
						...pagePartVars(part.key, partIndex === 0),
						...backgroundBlockVars(sectionColor, automaticContrast),
						...(motion ? { '--motion-strength': String(strength) } : {}),
						...(part.shotsLength && part.shotsFadeStart !== undefined
							? {
									'--shots-overlap': `${Math.max(
										(part.shotsLength - 100) *
											(1 - Math.min(Math.max(part.shotsFadeStart, 0), 95) / 100),
										0,
									)}vh`,
								}
							: {}),
					} as CSSProperties;
					return (
						<div
							className={`portfolio-page-part ${part.className}${sectionColor ? ' has-section-color' : ''}${config.sectionBleed?.[part.key] ? ' section-full-bleed' : ''}${motion ? ` motion-effect-${motion.effect}` : ''}`}
							style={partStyle}
							key={part.key}
							data-preview-part={part.key}
							data-motion-effect={motion?.effect}
							data-motion-strength={motion ? strength : undefined}
							data-motion-phone={motion?.phone ? 'true' : 'false'}
							data-section-color={
								sectionColor || config.background || content.theme.backgroundColor
							}
						>
							<div className="motion-section-inner">{part.rendered}</div>
							{resizeBreakpoint && onSectionHeight && (
								<SectionResizeHandle
									breakpoint={resizeBreakpoint}
									value={config.sectionHeights?.[part.key]?.[resizeBreakpoint]}
									viewportValue={
										config.sectionHeights?.[part.key]?.[
											resizeBreakpoint === 'phone' ? 'phoneVw' : 'desktopVw'
										]
									}
									gapValue={
										config.sectionHeights?.[part.key]?.[
											resizeBreakpoint === 'phone' ? 'phoneGap' : 'desktopGap'
										]
									}
									label={part.key === 'page:heading' ? 'page heading' : 'page section'}
									useTrailingGap
									allowNegativeGap={partIndex === 0}
									onChange={(height, viewportHeight, gap, recordHistory) =>
										onSectionHeight(
											page,
											part.key,
											resizeBreakpoint,
											height,
											viewportHeight,
											gap,
											recordHistory,
										)
									}
								/>
							)}
						</div>
					);
				})}
			</div>
			{content.site.signature && <Signature data={content.site.signature} base={base} />}
			{(content.site.footer || content.site.footerImage) && (
				<Footer
					text={content.site.footer ?? ''}
					imageSrc={content.site.footerImage ? (/^(?:blob:|data:|https?:|\/)/i.test(content.site.footerImage) ? content.site.footerImage : withBase(base, `assets/${content.site.footerImage}`)) : undefined}
					imageLayout={content.site.footerImageLayout}
					onImageLayout={onFooterImageLayout}
					heights={content.site.footerHeights}
					resizeBreakpoint={resizeBreakpoint}
					onHeightChange={onFooterHeight}
				/>
			)}
		</>
	);
}
