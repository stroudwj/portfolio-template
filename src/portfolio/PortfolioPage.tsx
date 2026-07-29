import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Hero from './Hero';
import Gallery, { type CarouselWidget } from './Gallery';
import About from './About';
import TextBlock from './TextBlock';
import Embed from './Embed';
import ContactForm from './ContactForm';
import { PortfolioButton, PortfolioDivider } from './PageBlocks';
import Products from './Products';
import ChildPages from './ChildPages';
import Signature from './Signature';
import Footer from './Footer';
import SectionMotionRuntime from './SectionMotion';
import SectionResizeHandle, {
	responsiveHeightVars,
	type SectionBreakpoint,
} from './SectionResizeHandle';
import {
	stripSlashes,
	withBase,
	type CanvasEmbed,
	type CanvasLayoutUpdates,
	type CanvasText,
	type PortfolioData,
	type TextLayout,
} from './types';
import { backgroundBlockVars } from './theme';
import { clampLayout, clampTextLayout, EMBED_AR, MIN_EMBED_W, MIN_TEXT_W, roundLayout, roundTextLayout } from './canvasLayout';
import type { ImageLayout, PageBlock } from '../lib/content';
import { sharedPageTransitionName } from './pageTransitions';
import ProjectDetails from './ProjectDetails';

export interface PortfolioPageProps extends PortfolioData {
	/** Page key: 'home', a nav path like 'art', or a nested path like 'work/project-a'. */
	page: string;
	base: string;
	/** Editor preview: switch pages in place instead of following real links. */
	onNavigate?: (path: string) => void;
	/** Editor preview: makes gallery images movable/resizable and reports changes. */
	onImageLayout?: (folder: string, imageId: string, layout: ImageLayout) => void;
	/** Editor preview: reports a text block placed/moved on the page canvas. */
	onTextLayout?: (page: string, blockId: string, layout: TextLayout) => void;
	/** Editor preview: reports a video embed placed/moved on the page canvas. */
	onEmbedLayout?: (page: string, blockId: string, layout: ImageLayout) => void;
	/** Editor preview: commits a mixed image/text/video canvas move atomically. */
	onCanvasLayouts?: (
		page: string,
		folder: string,
		updates: CanvasLayoutUpdates,
	) => void;
	onCarouselFrame?: (page: string, blockId: string, layout: ImageLayout) => void;
	onCarouselHost?: (
		page: string,
		blockId: string,
		hostId: string | undefined,
		layout?: ImageLayout,
	) => void;
	onCarouselFocus?: (folder: string, imageId: string, focusX: number, focusY: number) => void;
	/** Editor preview: responsive minimum-height editing for page sections. */
	resizeBreakpoint?: SectionBreakpoint;
	onSectionHeight?: (
		page: string,
		partKey: string,
		breakpoint: SectionBreakpoint,
		height: number | undefined,
	) => void;
	onFooterHeight?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
	/** Show editor-only guidance for empty portfolio content. */
	editorPreview?: boolean;
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
 * Editor-only wrapper that lets a flow block (text or video) be dragged onto the
 * page's freeform canvas: it follows the pointer, and dropping it inside the
 * canvas reports an equivalent canvas placement (same spot it was released).
 */
function DraggableFlowBlock({
	children,
	boxSelector,
	onPlace,
}: {
	children: React.ReactNode;
	/** The visible box inside the wrapper (the wrapper spans full width). */
	boxSelector: string;
	onPlace: (box: DropBox) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);

	const start = (e: React.PointerEvent) => {
		if (e.button !== 0) return;
		const el = ref.current;
		if (!el) return;
		// The page's PRIMARY canvas — extra image groups render their own canvases,
		// but pinned text/video always lives on the main gallery's canvas.
		const root = el.closest('.portfolio-root') ?? document;
		const canvas =
			root.querySelector('[data-primary-gallery] .canvas-gallery') ?? root.querySelector('.canvas-gallery');
		if (!canvas) return;
		e.preventDefault();
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
			className={`flow-text-draggable ${delta ? 'dragging' : ''}`}
			style={delta ? { transform: `translate(${delta.x}px, ${delta.y}px)` } : undefined}
			onPointerDown={start}
		>
			{children}
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
	onTextLayout,
	onEmbedLayout,
	onCanvasLayouts,
	onCarouselFrame,
	onCarouselHost,
	onCarouselFocus,
	resizeBreakpoint,
	onSectionHeight,
	onFooterHeight,
	editorPreview = false,
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
	const images = gallery ? (galleries[gallery.folder] ?? []) : [];
	const onLayoutChange =
		onImageLayout && gallery ? (id: string, layout: ImageLayout) => onImageLayout(gallery.folder, id, layout) : undefined;
	const textLayoutChange = onTextLayout ? (id: string, layout: TextLayout) => onTextLayout(page, id, layout) : undefined;
	const embedLayoutChange = onEmbedLayout ? (id: string, layout: ImageLayout) => onEmbedLayout(page, id, layout) : undefined;

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
			images: galleries[block.gallery.folder] ?? [],
			settings: block.gallery,
			alt: block.gallery.alt,
			onFocusChange: onCarouselFocus
				? (imageId, focusX, focusY) =>
						onCarouselFocus(block.gallery.folder, imageId, focusX, focusY)
				: undefined,
		};
		hostedCarousels.set(host.id, [...(hostedCarousels.get(host.id) ?? []), widget]);
	});
	const carouselLayoutChange = onCarouselFrame
		? (blockId: string, layout: ImageLayout) => onCarouselFrame(page, blockId, layout)
		: undefined;
	const carouselHostChange = onCarouselHost
		? (blockId: string, hostId: string, layout: ImageLayout) =>
				onCarouselHost(page, blockId, hostId, layout)
		: undefined;
	const pageOrder = new Map((config.mobile?.order ?? []).map((key, index) => [key, index]));
	const automaticPageKeys = [
		...(config.heading?.trim() ? ['page:heading'] : []),
		...(config.project ? ['page:project'] : []),
		...blocks.map((block) => `block:${block.id}`),
	];
	const automaticPageOrder = new Map(automaticPageKeys.map((key, index) => [key, index]));
	const automaticContrast = content.theme.automaticTextContrast !== false;
	const pagePartVars = (key: string): CSSProperties => {
		return {
			'--phone-page-order': String(pageOrder.get(key) ?? pageOrder.size + (automaticPageOrder.get(key) ?? 0)),
			'--phone-page-display': config.mobile?.items?.[key]?.hidden ? 'none' : 'flow-root',
			...responsiveHeightVars(config.sectionHeights?.[key]),
		} as CSSProperties;
	};
	const hasCanvas = !!gallery && gallery.layout !== 'grid' && blocks.some((b) => b.type === 'gallery');
	const canvasTexts: CanvasText[] = hasCanvas
		? blocks.flatMap((b) =>
			b.type === 'text' && b.layout
					? [{
							id: b.id,
							text: b.text,
							richText: b.richText,
							fontFamily: b.fontFamily,
							align: b.align,
							style: b.style,
							link: siteHref(b.link, base),
							kinetic: b.kinetic,
							kineticTarget: `block:${b.id}`,
							layout: b.layout,
						}]
					: [],
			)
		: [];
	const canvasEmbeds: CanvasEmbed[] = hasCanvas
		? blocks.flatMap((b) => (b.type === 'embed' && b.layout ? [{ id: b.id, url: b.url, layout: b.layout }] : []))
		: [];

	const renderBlock = (block: PageBlock) => {
		switch (block.type) {
			case 'text':
				// Pinned texts render inside the canvas instead of the page flow.
				if (hasCanvas && block.layout) return null;
				if (block.layout) {
					const standaloneText: CanvasText = {
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
					};
					return (
						<div key={block.id} className="page-content-wrapper standalone-text-box-canvas">
							<Gallery
								images={[]}
								texts={[standaloneText]}
								editable={!!textLayoutChange}
								onTextLayout={textLayoutChange}
							/>
						</div>
					);
				}
				return textLayoutChange && hasCanvas ? (
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
					/>
				);
			case 'embed':
				// Pinned videos render inside the canvas instead of the page flow.
				if (hasCanvas && block.layout) return null;
				return embedLayoutChange && hasCanvas && block.url.trim() ? (
					<DraggableFlowBlock
						key={block.id}
						boxSelector="iframe, .embed-fallback"
						onPlace={(box) =>
							embedLayoutChange(
								block.id,
								roundLayout(
									clampLayout({ x: box.x, y: box.y, w: Math.min(Math.max(box.w, MIN_EMBED_W), 100), ar: EMBED_AR }),
								),
							)
						}
					>
						<Embed url={block.url} />
					</DraggableFlowBlock>
				) : (
					<Embed key={block.id} url={block.url} />
				);
			case 'about': {
				const resume =
					resumeHref || (content.resume && content.resume.url)
						? { label: content.resume?.label || 'Résumé', href: resumeHref ?? withBase(base, content.resume.url) }
						: null;
				return (
					<About
						key={block.id}
						name={content.site.name}
						bio={content.profile.bio}
						email={content.contact.email}
						social={content.social}
						profileImageSrc={profileImageSrc}
						resume={resume}
						editorPreview={editorPreview}
					/>
				);
			}
			case 'children': {
				const items = (config.children ?? []).map((key) => ({
					key,
					label: content.pages[key]?.label ?? key,
					href: withBase(base, `${key}/`),
					thumbSrc: pageThumbs?.[key],
				}));
				return (
					<ChildPages
						key={block.id}
						items={items}
						style={block.style}
						onNavigate={onNavigate}
						pageTransition={content.site.creative?.pageTransition}
					/>
				);
			}
			case 'products':
				if (!content.store) return null;
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
						texts={canvasTexts}
						embeds={canvasEmbeds}
						carouselWidgets={hostedCarousels.get(block.id)}
						editable={!!onLayoutChange}
						onLayoutChange={onLayoutChange}
						onTextLayout={textLayoutChange}
						onEmbedLayout={embedLayoutChange}
						onCarouselWidgetLayout={carouselLayoutChange}
						onBulkLayoutChange={
							onCanvasLayouts && gallery
								? (updates) => onCanvasLayouts(page, gallery.folder, updates)
								: undefined
						}
					/>
				);
				// Home keeps its collage layout; other pages the standard wrapper (the
				// page-photo modifier preserves the original photography page's spacing).
				return page === 'home' ? (
					<div
						key={block.id}
						className="collage-container"
						data-primary-gallery
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
				const groupImages = galleries[block.gallery.folder] ?? [];
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
					>
						<Gallery
							images={groupImages}
							alt={block.gallery.alt}
							settings={block.gallery}
							carouselWidgets={hostedCarousels.get(block.id)}
							editable={!!onImageLayout}
							onLayoutChange={
								onImageLayout ? (id, layout) => onImageLayout(block.gallery.folder, id, layout) : undefined
							}
							onBulkLayoutChange={
								onCanvasLayouts
									? (updates) => onCanvasLayouts(page, block.gallery.folder, updates)
									: undefined
							}
							onCarouselWidgetLayout={carouselLayoutChange}
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
				return <PortfolioDivider key={block.id} />;
			case 'form':
				return (
					<ContactForm
						key={block.id}
						heading={block.heading}
						action={block.action}
						fallbackEmail={content.contact.email}
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
	const pageParts = [
		...(config.heading?.trim()
			? [{
					key: 'page:heading',
					className: 'portfolio-page-heading',
					rendered: (
						<Hero
							heading={config.heading}
							position={content.theme.pageHeadingPosition}
							kinetic={config.headingKinetic}
						/>
					),
				}]
			: []),
		...(config.project
			? [{
					key: 'page:project',
					className: 'portfolio-project-details',
					rendered: <ProjectDetails project={config.project} />,
				}]
			: []),
		...blocks.flatMap((block) => {
			const rendered = renderBlock(block);
			return rendered ? [{ key: `block:${block.id}`, className: 'portfolio-page-block', rendered }] : [];
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
				signature={JSON.stringify(config.sectionMotion ?? {})}
			/>
			<div
				ref={setPageRoot}
				className={`portfolio-page-body page-${page === 'home' ? 'home' : 'inner'} ${config.heading?.trim() ? 'has-page-heading' : 'without-page-heading'}`}
				data-phone-ready={isPhone ? 'true' : undefined}
			>
				{pageParts.map((part) => {
					const sectionColor = config.sectionColors?.[part.key];
					const motion = config.sectionMotion?.[part.key];
					const strength = Math.min(Math.max(motion?.intensity ?? 45, 1), 100);
					const partStyle = {
						...pagePartVars(part.key),
						...backgroundBlockVars(sectionColor, automaticContrast),
						...(motion ? { '--motion-strength': String(strength) } : {}),
					} as CSSProperties;
					return (
						<div
							className={`portfolio-page-part ${part.className}${sectionColor ? ' has-section-color' : ''}${motion ? ` motion-effect-${motion.effect}` : ''}`}
							style={partStyle}
							key={part.key}
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
									label={part.key === 'page:heading' ? 'page heading' : 'page section'}
									onChange={(height) =>
										onSectionHeight(page, part.key, resizeBreakpoint, height)
									}
								/>
							)}
						</div>
					);
				})}
			</div>
			{content.site.signature && <Signature data={content.site.signature} />}
			{content.site.footer && (
				<Footer
					text={content.site.footer}
					heights={content.site.footerHeights}
					resizeBreakpoint={resizeBreakpoint}
					onHeightChange={onFooterHeight}
				/>
			)}
		</>
	);
}
