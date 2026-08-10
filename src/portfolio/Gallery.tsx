import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type {
	CanvasEmbed,
	CanvasLayoutUpdates,
	CanvasSelection,
	CanvasText,
	GalleryConfig,
	ImageLayout,
	ResolvedImage,
	TextLayout,
} from './types';
import { safeHref } from './safeHref';
import { showSampleUnavailable } from './sampleFallback';
import type { ArtworkMount } from '../lib/content';
import CanvasGallery, { type CanvasWidget } from './CanvasGallery';
import { type InlineTextEditing } from './InlineTextEditor';
import {
	bottomOf,
	clampLayout,
	columnEdges,
	columnSpans,
	DEFAULT_AR,
	EDGE_SNAP,
	MIN_W,
	nearestEdge,
	roundLayout,
	snapSpanToCenter,
	snapSpanToEdges,
	snapTo,
	snapToEdges,
} from './canvasLayout';
import { guideById, useGridPrefs } from './gridPrefs';
import { gridGap, lastRowSpacer, packSmartRows, rowTargetSum, wallJitter } from './smartGrid';
import { artworkAdjustFilter, artworkEffectClass, artworkEffectStyle } from './artworkEffects';
import './Gallery.css';
import './ArtworkEffects.css';

export const GRID_MAX_SPAN = 4;
export const DEFAULT_CAROUSEL_FRAME: ImageLayout = { x: 20, y: 12.5, w: 60, ar: 16 / 10 };
const MIN_CAROUSEL_CANVAS_HEIGHT = 62.5;

const clampSpan = (value: number | undefined): number =>
	Math.min(Math.max(Math.round(value ?? 1), 1), GRID_MAX_SPAN);

/** Per-image grid placement as CSS variables Gallery.css turns into spans. */
const spanVars = (img: ResolvedImage): CSSProperties =>
	({ '--w': String(clampSpan(img.w)), '--h': String(clampSpan(img.h)) }) as CSSProperties;

/** Phone-only CSS variables. They are inert above the phone breakpoint, so a
 * custom phone arrangement can never disturb the desktop composition. */
function phoneItemVars(settings: GalleryConfig | undefined, key: string, fallbackOrder: number): CSSProperties {
	const mobile = settings?.mobile;
	const style = mobile?.items?.[key];
	const requested = mobile?.order.indexOf(key) ?? -1;
	const order = requested >= 0 ? requested : (mobile?.order.length ?? 0) + fallbackOrder;
	const width = style?.width ?? 100;
	const align = style?.align ?? 'center';
	return {
		'--mobile-order': String(order),
		'--mobile-width': String(width),
		'--mobile-display': style?.hidden ? 'none' : 'block',
		'--mobile-margin-left': align === 'left' ? '0' : 'auto',
		'--mobile-margin-right': align === 'right' ? '0' : 'auto',
	} as CSSProperties;
}

const imagePhoneKey = (img: ResolvedImage, index: number): string =>
	`image:${img.id ?? `${img.src}-${index}`}`;

/** A link only replaces the lightbox when the artist explicitly chose that action. */
const imageClickHref = (img: ResolvedImage | undefined): string | undefined =>
	img?.clickAction === 'link' ? safeHref(img.link) : undefined;

const externalImageLink = (href: string): boolean => /^https?:/i.test(href);

/** Uniform grid: images per row, clamped to something sane. */
export const uniformColumns = (value: number | undefined): number =>
	Math.min(Math.max(Math.round(value ?? 3), 1), 6);

/** Parse a crop ratio like "4:3" (or "4/3") to a number; undefined = no crop. */
export function parseAspect(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(value.trim());
	if (!m) return undefined;
	const w = Number(m[1]);
	const h = Number(m[2]);
	return w > 0 && h > 0 ? w / h : undefined;
}

const nativeCropStyle = (image: ResolvedImage): CSSProperties => {
	const ratio = parseAspect(image.cropAspect);
	return {
		...(ratio ? { aspectRatio: String(ratio), objectFit: 'cover' as const } : {}),
		objectPosition: `${image.focusX ?? 50}% ${image.focusY ?? 50}%`,
		scale: image.cropZoom && image.cropZoom > 1 ? String(image.cropZoom) : undefined,
		transformOrigin: `${image.focusX ?? 50}% ${image.focusY ?? 50}%`,
	};
};

export interface GalleryProps {
	images: ResolvedImage[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** The page's gallery config — layout mode, grid columns and crop ratio. */
	settings?: GalleryConfig;
	/** Text blocks pinned to the freeform canvas. */
	texts?: CanvasText[];
	/** Video embeds pinned to the freeform canvas. */
	embeds?: CanvasEmbed[];
	/** New/unplaced images begin below earlier freeform items in the section. */
	autoFlowFloor?: number;
	/** Editor preview: images become movable/resizable instead of zoomable. */
	editable?: boolean;
	/** Reports a finished move/resize per image (editor only). */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Editor: switches an image's mount right from the canvas toolbar. */
	onImageMount?: (id: string, mount: ArtworkMount | undefined) => void;
	/** Reports a finished move/resize per pinned text (editor only). */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned video embed (editor only). */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
	/** Reports one atomic mixed-item canvas move (editor only). */
	onBulkLayoutChange?: (updates: CanvasLayoutUpdates) => void;
	/** Deletes selected freeform items (editor only). */
	onDeleteSelection?: (selection: CanvasSelection) => void;
	/** Reports carousel frame movement/resizing (editor only). */
	onCarouselFrameChange?: (layout: ImageLayout) => void;
	/** Reports an explicit drop of a standalone carousel onto a freeform canvas. */
	onCarouselHostChange?: (hostId: string, layout: ImageLayout) => void;
	/** Reports the crop focal point for one carousel image (editor only). */
	onCarouselFocusChange?: (id: string, focusX: number, focusY: number) => void;
	/** Reports non-destructive image scaling inside the carousel frame. */
	onCarouselZoomChange?: (id: string, zoom: number) => void;
	/** Carousels owned by other image-group blocks but hosted on this freeform canvas. */
	carouselWidgets?: CarouselWidget[];
	/** Other complete blocks (sub-pages/products) hosted on this freeform canvas. */
	canvasWidgets?: CanvasWidget[];
	/** Reports movement/resizing for a widget hosted by this freeform canvas. */
	onCarouselWidgetLayout?: (id: string, layout: ImageLayout) => void;
	/** Deletes this standalone carousel after its frame is selected. */
	onDeleteCarousel?: () => void;
	/** Render only the carousel itself; an outer CanvasGallery owns its frame. */
	embeddedCarousel?: boolean;
	/** Editor-only guidance when the gallery has nothing to show: the page-empty
	 * message (default), a caller-supplied block-scoped hint, or nothing (null).
	 * Published sites always render nothing for an empty gallery. */
	emptyHint?: string | null;
	/** Editor preview: keep internal image links inside the preview router. */
	onImageLink?: (url: string, event: ReactMouseEvent<HTMLElement>) => void;
	onSelectBlock?: (blockId: string) => void;
	/** Editor preview: the pinned text currently being edited in place. */
	inlineTextEditing?: InlineTextEditing;
}

export interface CarouselWidget {
	id: string;
	images: ResolvedImage[];
	settings: GalleryConfig;
	alt?: string;
	onFocusChange?: (id: string, focusX: number, focusY: number) => void;
	onZoomChange?: (id: string, zoom: number) => void;
}

/**
 * A page's images + click-to-zoom lightbox, in one of three layouts:
 * - 'grid' (settings.layout): the classic auto-arranged uniform grid — chosen
 *   columns, optional crop ratio, zero manual placement;
 * - the freeform canvas (CanvasGallery) whenever any image carries a layout —
 *   always in the editor;
 * - the legacy span grid for never-rearranged content.
 */
export default function Gallery({
	images,
	alt = 'Portfolio piece',
	settings,
	texts,
	embeds,
	autoFlowFloor,
	editable = false,
	inlineTextEditing,
	onLayoutChange,
	onImageMount,
	onTextLayout,
	onEmbedLayout,
	onBulkLayoutChange,
	onDeleteSelection,
	onCarouselFrameChange,
	onCarouselHostChange,
	onCarouselFocusChange,
	onCarouselZoomChange,
	carouselWidgets = [],
	canvasWidgets = [],
	onCarouselWidgetLayout,
	onDeleteCarousel,
	embeddedCarousel = false,
	emptyHint,
	onImageLink,
	onSelectBlock,
}: GalleryProps) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const [carouselPosition, setCarouselPosition] = useState(0);
	const [carouselFrameDraft, setCarouselFrameDraft] = useState<ImageLayout | null>(null);
	const [carouselFocusDraft, setCarouselFocusDraft] = useState<{ id: string; x: number; y: number } | null>(null);
	const [carouselZoomDraft, setCarouselZoomDraft] = useState<{ id: string; zoom: number } | null>(null);
	const [carouselSelected, setCarouselSelected] = useState(false);
	const [carouselCenterGuide, setCarouselCenterGuide] = useState(false);
	const open = openIndex !== null ? images[openIndex] : null;
	const isOpen = openIndex !== null;
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const galleryRootRef = useRef<HTMLDivElement | null>(null);
	const cropDraggedRef = useRef(false);
	const frameDraggedRef = useRef(false);
	const gridPrefs = useGridPrefs();
	const dialogTitleId = useId();
	const dialogCaptionId = useId();
	// The <body> this gallery actually renders in (the editor preview can run
	// inside an iframe). The lightbox portals there so no transformed/scrollable
	// ancestor (like the editor's preview pane) can trap or scroll past it.
	const [host, setHost] = useState<HTMLElement | null>(null);
	const [isPhone, setIsPhone] = useState(false);
	const setGalleryRoot = useCallback((el: HTMLDivElement | null) => {
		galleryRootRef.current = el;
		setHost(el ? el.ownerDocument.body : null);
	}, []);
	const closeLightbox = useCallback(() => setOpenIndex(null), []);
	const renderedImages = useMemo(() => {
		const entries = images.map((img, i) => ({ img, i }));
		if (!isPhone || !settings?.mobile) return entries;
		const rank = new Map(settings.mobile.order.map((key, index) => [key, index]));
		return entries.sort(
			(a, b) =>
				(rank.get(imagePhoneKey(a.img, a.i)) ?? rank.size + a.i) -
				(rank.get(imagePhoneKey(b.img, b.i)) ?? rank.size + b.i),
		);
	}, [images, isPhone, settings?.mobile]);
	const lightboxIndices = useMemo(
		() =>
			renderedImages.flatMap(({ img, i }) => {
				const hidden = settings?.mobile?.items?.[imagePhoneKey(img, i)]?.hidden;
				return (isPhone && hidden) || imageClickHref(img) ? [] : [i];
			}),
		[isPhone, renderedImages, settings?.mobile?.items],
	);
	// Smart grid: aspect ratios measured from the loaded pixels when the caller
	// couldn't supply them (the editor preview resolves blob URLs without
	// dimensions; published builds always pass `ar`, so this never runs there).
	const [smartArs, setSmartArs] = useState<Record<string, number>>({});
	const measureSmartAr = useCallback((key: string, el: HTMLImageElement) => {
		if (!el.naturalWidth || !el.naturalHeight) return;
		const ar = el.naturalWidth / el.naturalHeight;
		setSmartArs((m) => (m[key] !== undefined ? m : { ...m, [key]: ar }));
	}, []);
	const smartMode = settings?.layout === 'grid' && settings.smartGrid === true;
	const smartLayout = useMemo(() => {
		if (!smartMode) return null;
		const ars = renderedImages.map(
			({ img, i }) =>
				parseAspect(img.cropAspect) ?? img.ar ?? smartArs[imagePhoneKey(img, i)] ?? DEFAULT_AR,
		);
		const columns = uniformColumns(settings?.columns);
		return { ars, rows: packSmartRows(ars, columns), target: rowTargetSum(ars, columns) };
	}, [smartMode, renderedImages, smartArs, settings?.columns]);
	const carouselEntries = useMemo(
		() =>
			renderedImages.filter(({ img, i }) => {
				const hidden = settings?.mobile?.items?.[imagePhoneKey(img, i)]?.hidden;
				return !isPhone || !hidden;
			}),
		[isPhone, renderedImages, settings?.mobile?.items],
	);
	const activeCarouselEntry = carouselEntries[carouselPosition] ?? carouselEntries[0];
	const activeCarouselHref = editable ? undefined : imageClickHref(activeCarouselEntry?.img);
	const moveCarousel = useCallback(
		(direction: -1 | 1) => {
			if (carouselEntries.length < 2) return;
			setCarouselFocusDraft(null);
			setCarouselPosition(
				(current) => (current + direction + carouselEntries.length) % carouselEntries.length,
			);
		},
		[carouselEntries.length],
	);
	const openLightbox = useCallback(
		(index: number, trigger?: HTMLElement) => {
			setOpenIndex((current) => {
				if (current === null) {
					const active = trigger ?? host?.ownerDocument.activeElement;
					returnFocusRef.current = active && 'focus' in active ? (active as HTMLElement) : null;
				}
				return index;
			});
		},
		[host],
	);
	const moveLightbox = useCallback(
		(direction: -1 | 1) => {
			if (lightboxIndices.length < 2) return;
			setOpenIndex((current) => {
				if (current === null) return null;
				const position = Math.max(lightboxIndices.indexOf(current), 0);
				return lightboxIndices[(position + direction + lightboxIndices.length) % lightboxIndices.length];
			});
		},
		[lightboxIndices],
	);
	const openFromKeyboard = (e: ReactKeyboardEvent<HTMLElement>, index: number) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		openLightbox(index, e.currentTarget);
	};
	const savedCarouselFrame = settings?.carouselFrame ?? DEFAULT_CAROUSEL_FRAME;
	const carouselFrame = carouselFrameDraft ?? savedCarouselFrame;
	const carouselFit = settings?.carouselFit ?? 'fit';
	// Keep the section height stable during a gesture. Otherwise dragging a
	// standalone carousel downward pushes a target canvas away from the pointer.
	const carouselCanvasHeight = Math.max(MIN_CAROUSEL_CANVAS_HEIGHT, bottomOf(savedCarouselFrame));
	const carouselGuide = guideById(gridPrefs.guide);
	const carouselGuideSnap = editable && gridPrefs.snap && carouselGuide.kind !== 'off';
	const carouselSquareStep =
		carouselGuideSnap && carouselGuide.kind === 'squares' ? 100 / carouselGuide.n : 0;
	const carouselColumnEdges =
		carouselGuideSnap && carouselGuide.kind === 'columns' ? columnEdges(carouselGuide.n) : [];
	const snapCarouselX = (value: number): number =>
		carouselColumnEdges.length ? snapToEdges(value, carouselColumnEdges) : snapTo(value, carouselSquareStep);
	const snapCarouselY = (value: number): number => snapTo(value, carouselSquareStep);

	const startCarouselFrameGesture = (
		event: React.PointerEvent<HTMLElement>,
		mode: 'move' | 'resize',
		corner: 'nw' | 'ne' | 'sw' | 'se' = 'se',
	) => {
		if (!editable || !onCarouselFrameChange || event.button !== 0) return;
		const root = galleryRootRef.current;
		const stage = root?.querySelector<HTMLElement>('.inline-carousel-stage');
		if (!root || !stage) return;
		event.preventDefault();
		event.stopPropagation();
		setCarouselSelected(true);
		root.focus({ preventScroll: true });
		const win = root.ownerDocument.defaultView ?? window;
		const rootRect = root.getBoundingClientRect();
		if (!rootRect.width) return;
		const from = carouselFrame;
		const startX = event.clientX;
		const startY = event.clientY;
		let draft = from;
		frameDraggedRef.current = false;
		const move = (next: PointerEvent) => {
			const dx = ((next.clientX - startX) / rootRect.width) * 100;
			const dy = ((next.clientY - startY) / rootRect.width) * 100;
			if (Math.abs(dx) + Math.abs(dy) > 0.3) frameDraggedRef.current = true;
			if (mode === 'move') {
				let x = snapCarouselX(from.x + dx);
				let y = snapCarouselY(from.y + dy);
				if (gridPrefs.edgeSnap) {
					x = snapSpanToEdges(x, from.w, [0, 100]);
					y = snapSpanToEdges(y, from.w / from.ar, [0, MIN_CAROUSEL_CANVAS_HEIGHT]);
				}
				if (gridPrefs.centerSnap) {
					const centered = snapSpanToCenter(x, from.w);
					x = centered.value;
					setCarouselCenterGuide(centered.snapped);
				} else {
					setCarouselCenterGuide(false);
				}
				draft = clampLayout({ ...from, x, y });
			} else {
				setCarouselCenterGuide(false);
				const east = corner.endsWith('e');
				const south = corner.startsWith('s');
				const originalHeight = from.w / from.ar;
				const right = from.x + from.w;
				const bottom = from.y + originalHeight;
				if (settings?.carouselFreeResize === true) {
					let width = Math.max(from.w + (east ? dx : -dx), MIN_W);
					let height = Math.max(originalHeight + (south ? dy : -dy), MIN_W);
					width = Math.min(width, east ? 100 - from.x : right);
					if (!south) height = Math.min(height, bottom);
					if (carouselGuideSnap) {
						const movingX = east ? from.x + width : right - width;
						const movingY = south ? from.y + height : bottom - height;
						const snappedX = snapCarouselX(movingX);
						const snappedY = snapCarouselY(movingY);
						width = Math.max(east ? snappedX - from.x : right - snappedX, MIN_W);
						height = Math.max(south ? snappedY - from.y : bottom - snappedY, MIN_W);
					}
					if (gridPrefs.edgeSnap) {
						const horizontal = nearestEdge(east ? from.x + width : right - width, [0, 100], EDGE_SNAP);
						const vertical = nearestEdge(
							south ? from.y + height : bottom - height,
							[0, MIN_CAROUSEL_CANVAS_HEIGHT],
							EDGE_SNAP,
						);
						if (horizontal !== null) width = Math.max(east ? horizontal - from.x : right - horizontal, MIN_W);
						if (vertical !== null) height = Math.max(south ? vertical - from.y : bottom - vertical, MIN_W);
					}
					width = Math.min(width, east ? 100 - from.x : right);
					if (!south) height = Math.min(height, bottom);
					draft = clampLayout({
						...from,
						x: east ? from.x : right - width,
						y: south ? from.y : bottom - height,
						w: width,
						ar: Math.min(Math.max(width / height, 0.2), 5),
					});
					setCarouselFrameDraft(draft);
					return;
				}
				const growthX = east ? dx : -dx;
				const growthY = (south ? dy : -dy) * from.ar;
				const growth = Math.abs(growthX) >= Math.abs(growthY) ? growthX : growthY;
				let width = Math.max(from.w + growth, MIN_W);
				width = Math.min(width, east ? 100 - from.x : right);
				if (!south) width = Math.min(width, bottom * from.ar);
				if (carouselGuideSnap) {
					const movingX = east ? from.x + width : right - width;
					const snappedX = snapCarouselX(movingX);
					width = Math.max(east ? snappedX - from.x : right - snappedX, MIN_W);
				}
				if (gridPrefs.edgeSnap) {
					const horizontal = nearestEdge(east ? from.x + width : right - width, [0, 100], EDGE_SNAP);
					const vertical = nearestEdge(south ? from.y + width / from.ar : bottom - width / from.ar, [0, MIN_CAROUSEL_CANVAS_HEIGHT], EDGE_SNAP);
					const widthAtRight = horizontal === null ? null : east ? horizontal - from.x : right - horizontal;
					const widthAtBottom = vertical === null ? null : south ? (vertical - from.y) * from.ar : (bottom - vertical) * from.ar;
					const rightDistance = widthAtRight === null ? Infinity : Math.abs(widthAtRight - width);
					const bottomDistance = widthAtBottom === null ? Infinity : Math.abs(widthAtBottom - width);
					if (rightDistance <= bottomDistance && rightDistance < Infinity) width = widthAtRight as number;
					else if (bottomDistance < Infinity) width = widthAtBottom as number;
				}
				width = Math.min(width, east ? 100 - from.x : right);
				if (!south) width = Math.min(width, bottom * from.ar);
				width = Math.max(width, MIN_W);
				draft = clampLayout({
					...from,
					x: east ? from.x : right - width,
					y: south ? from.y : bottom - width / from.ar,
					w: width,
				});
			}
			setCarouselFrameDraft(draft);
		};
		const up = (next: PointerEvent) => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			setCarouselCenterGuide(false);
			setCarouselFrameDraft(null);
			if (
				next.type !== 'pointercancel' &&
				mode === 'move' &&
				frameDraggedRef.current &&
				onCarouselHostChange
			) {
				const target = Array.from(
					root.ownerDocument.querySelectorAll<HTMLElement>('[data-carousel-canvas-host]'),
				)
					.map((wrapper) => ({
						hostId: wrapper.dataset.carouselCanvasHost,
						canvas: wrapper.querySelector<HTMLElement>('.canvas-gallery'),
					}))
					.find(({ hostId, canvas }) => {
						if (!hostId || !canvas || root.contains(canvas)) return false;
						const rect = canvas.getBoundingClientRect();
						return (
							next.clientX >= rect.left &&
							next.clientX <= rect.right &&
							next.clientY >= rect.top &&
							next.clientY <= rect.bottom
						);
					});
				if (target?.hostId && target.canvas) {
					const targetRect = target.canvas.getBoundingClientRect();
					const scale = 100 / targetRect.width;
					const dropped = clampLayout({
						x: (rootRect.left + (draft.x / 100) * rootRect.width - targetRect.left) * scale,
						y: (rootRect.top + (draft.y / 100) * rootRect.width - targetRect.top) * scale,
						w: (draft.w / 100) * rootRect.width * scale,
						ar: draft.ar,
					});
					onCarouselHostChange(target.hostId, roundLayout(dropped));
					return;
				}
			}
			if (frameDraggedRef.current) onCarouselFrameChange(roundLayout(draft));
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	const startCarouselCrop = (
		event: React.PointerEvent<HTMLImageElement>,
		id: string,
		focusX: number,
		focusY: number,
		zoom: number,
	) => {
		if (!editable || settings?.carouselMoveImage !== true || !onCarouselFocusChange || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		setCarouselSelected(true);
		const image = event.currentTarget;
		const rect = image.getBoundingClientRect();
		const naturalWidth = image.naturalWidth || rect.width;
		const naturalHeight = image.naturalHeight || rect.height;
		const imageScale =
			carouselFit === 'fill'
				? Math.max(rect.width / naturalWidth, rect.height / naturalHeight)
				: Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
		const normalizedZoom = Math.min(Math.max(zoom, 1), 6);
		const scaledWidth = naturalWidth * imageScale;
		const scaledHeight = naturalHeight * imageScale;
		const zoomedWidth = scaledWidth * normalizedZoom;
		const zoomedHeight = scaledHeight * normalizedZoom;
		const travelX =
			carouselFit === 'fill' || normalizedZoom > 1
				? Math.max(zoomedWidth - rect.width, 0)
				: Math.max(rect.width - scaledWidth, 0);
		const travelY =
			carouselFit === 'fill' || normalizedZoom > 1
				? Math.max(zoomedHeight - rect.height, 0)
				: Math.max(rect.height - scaledHeight, 0);
		const direction = carouselFit === 'fill' || normalizedZoom > 1 ? -1 : 1;
		const win = image.ownerDocument.defaultView ?? window;
		const startX = event.clientX;
		const startY = event.clientY;
		let nextX = focusX;
		let nextY = focusY;
		cropDraggedRef.current = false;
		const move = (next: PointerEvent) => {
			const dx = next.clientX - startX;
			const dy = next.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 3) cropDraggedRef.current = true;
			nextX =
				travelX > 0.5
					? Math.min(Math.max(focusX + direction * (dx / travelX) * 100, 0), 100)
					: focusX;
			nextY =
				travelY > 0.5
					? Math.min(Math.max(focusY + direction * (dy / travelY) * 100, 0), 100)
					: focusY;
			setCarouselFocusDraft({ id, x: nextX, y: nextY });
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			setCarouselFocusDraft(null);
			if (cropDraggedRef.current) onCarouselFocusChange(id, Math.round(nextX), Math.round(nextY));
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	const startCarouselImageResize = (
		event: React.PointerEvent<HTMLElement>,
		id: string,
		startZoom: number,
		corner: 'nw' | 'ne' | 'sw' | 'se',
	) => {
		if (!editable || settings?.carouselMoveImage !== true || !onCarouselZoomChange || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const stage = event.currentTarget.closest<HTMLElement>('.inline-carousel-stage');
		if (!stage) return;
		const rect = stage.getBoundingClientRect();
		const startX = event.clientX;
		const startY = event.clientY;
		const directionX = corner.includes('e') ? 1 : -1;
		const directionY = corner.includes('s') ? 1 : -1;
		const win = stage.ownerDocument.defaultView ?? window;
		let zoom = Math.min(Math.max(startZoom, 1), 6);
		const move = (next: PointerEvent) => {
			const distance =
				((next.clientX - startX) * directionX + (next.clientY - startY) * directionY) /
				Math.max(rect.width + rect.height, 1);
			zoom = Math.min(Math.max(startZoom + distance * 8, 1), 6);
			setCarouselZoomDraft({ id, zoom });
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			setCarouselZoomDraft(null);
			onCarouselZoomChange(id, Math.round(zoom * 100) / 100);
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	useEffect(() => {
		const win = host?.ownerDocument.defaultView;
		if (!win) return;
		const query = win.matchMedia('(max-width: 639px)');
		const update = () => setIsPhone(query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, [host]);

	useEffect(() => {
		if (openIndex !== null && !lightboxIndices.includes(openIndex)) closeLightbox();
	}, [closeLightbox, lightboxIndices, openIndex]);

	useEffect(() => {
		setCarouselPosition((current) => Math.min(current, Math.max(carouselEntries.length - 1, 0)));
	}, [carouselEntries.length]);

	useEffect(() => {
		if (!editable || !carouselSelected || !onDeleteCarousel) return;
		const root = galleryRootRef.current;
		const doc = root?.ownerDocument;
		if (!root || !doc) return;
		const onKey = (event: KeyboardEvent) => {
			if (
				(event.key !== 'Backspace' && event.key !== 'Delete') ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				(doc.activeElement !== root && !root.contains(doc.activeElement))
			) return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.matches('input, textarea, select') ||
					target.isContentEditable ||
					!!target.closest('[contenteditable="true"]'))
			) return;
			event.preventDefault();
			event.stopPropagation();
			setCarouselSelected(false);
			onDeleteCarousel();
		};
		doc.addEventListener('keydown', onKey);
		return () => doc.removeEventListener('keydown', onKey);
	}, [carouselSelected, editable, onDeleteCarousel]);

	useEffect(() => {
		if (!isOpen || !host) return;
		const doc = host.ownerDocument;
		const dialog = dialogRef.current;
		if (!dialog) return;
		const focusableSelector = [
			'a[href]',
			'button:not([disabled])',
			'input:not([disabled])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])',
		].join(',');
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				closeLightbox();
				return;
			}
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				moveLightbox(-1);
				return;
			}
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				moveLightbox(1);
				return;
			}
			if (e.key !== 'Tab') return;
			const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
				(el) => el.getClientRects().length > 0,
			);
			if (focusable.length === 0) {
				e.preventDefault();
				dialog.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = doc.activeElement;
			if (!dialog.contains(active)) {
				e.preventDefault();
				first.focus();
			} else if (e.shiftKey && (active === first || active === dialog)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		};
		doc.addEventListener('keydown', onKey);
		const previousOverflow = host.style.overflow;
		host.style.overflow = 'hidden';
		const frame = doc.defaultView?.requestAnimationFrame(() => (closeButtonRef.current ?? dialog).focus());
		return () => {
			doc.removeEventListener('keydown', onKey);
			if (frame !== undefined) doc.defaultView?.cancelAnimationFrame(frame);
			host.style.overflow = previousOverflow;
			const returnTarget = returnFocusRef.current;
			if (returnTarget?.isConnected) returnTarget.focus();
			returnFocusRef.current = null;
		};
	}, [closeLightbox, host, isOpen, moveLightbox]);

	const editableEmptyCanvas =
		editable && settings?.carousel !== true && settings?.layout !== 'grid';
	if (
		images.length === 0 &&
		!texts?.length &&
		!embeds?.length &&
		carouselWidgets.length === 0 &&
		canvasWidgets.length === 0 &&
		!editableEmptyCanvas
	) {
		// Guidance belongs to the editor; a published page must never claim it is
		// empty (an empty image group used to print this over real page content).
		if (!editable || emptyHint === null) return null;
		return (
			<div className="gallery-empty">
				<p>{emptyHint ?? 'This page is empty… add some images, text, or embeds.'}</p>
			</div>
		);
	}

	const uniformMode = settings?.layout === 'grid';
	const carouselMode = settings?.carousel === true;
	const canvasMode =
		!carouselMode &&
		!uniformMode &&
		(editable ||
			images.some((img) => img.layout) ||
			!!texts?.length ||
			!!embeds?.length ||
			carouselWidgets.length > 0 ||
			canvasWidgets.length > 0);
	const cols = uniformColumns(settings?.columns);
	const cellAr = parseAspect(settings?.aspect);
	const carouselRootStyle = carouselMode
		&& !embeddedCarousel
		? ({
				'--carousel-ch': String(carouselCanvasHeight),
			} as CSSProperties)
		: undefined;
	const carouselItemStyle = carouselMode
		? ({
				...(activeCarouselEntry ? artworkEffectStyle(activeCarouselEntry.img) : {}),
				'--carousel-chrome': settings?.carouselChromeColor || 'var(--color-accent)',
				'--carousel-arrow': settings?.carouselArrowColor || 'var(--color-bg)',
				...(!embeddedCarousel ? {
				'--carousel-x': String(carouselFrame.x),
				'--carousel-y': String((carouselFrame.y / carouselCanvasHeight) * 100),
				'--carousel-w': String(carouselFrame.w),
				'--carousel-ar': String(carouselFrame.ar),
				} : {}),
			} as CSSProperties)
		: undefined;
	const canvasCarouselWidgets: CanvasWidget[] = carouselWidgets.map((widget) => ({
		id: widget.id,
		layout: widget.settings.carouselFrame ?? DEFAULT_CAROUSEL_FRAME,
		freeResize: widget.settings.carouselFreeResize === true,
		moveImage: widget.settings.carouselMoveImage === true,
		// Title/count sit under the frame; a scrollbox would hide them behind a
		// stray scrollbar instead of letting them hang below like the standalone
		// canvas carousel does.
		overflowVisible: true,
		content: (
			<Gallery
				key={widget.id}
				images={widget.images}
				alt={widget.alt}
				settings={widget.settings}
				editable={editable}
				embeddedCarousel
				onCarouselFocusChange={widget.onFocusChange}
				onCarouselZoomChange={widget.onZoomChange}
				onImageLink={onImageLink}
				onSelectBlock={onSelectBlock}
			/>
		),
	}));

	const modal = open && openIndex !== null ? (
		<div
			ref={dialogRef}
			className="modal show"
			role="dialog"
			aria-modal="true"
			aria-labelledby={dialogTitleId}
			aria-describedby={open.description ? dialogCaptionId : undefined}
			tabIndex={-1}
			onClick={(e) => {
				if (e.target === e.currentTarget) closeLightbox();
			}}
		>
			<h2 id={dialogTitleId} className="lightbox-heading" aria-live="polite">
				{open.title || `Artwork ${Math.max(lightboxIndices.indexOf(openIndex), 0) + 1} of ${lightboxIndices.length}`}
			</h2>
			<button
				ref={closeButtonRef}
				type="button"
				className="close-btn"
				aria-label="Close image viewer"
				onClick={closeLightbox}
			>
				&times;
			</button>
			{lightboxIndices.length > 1 && (
				<button
					type="button"
					className="lightbox-nav previous"
					aria-label="Show previous image"
					onClick={() => moveLightbox(-1)}
				>
					◀
				</button>
			)}
			<figure className="modal-figure">
				<img
					src={open.full ?? open.src}
					alt={open.decorative ? '' : open.alt || open.title || 'Full resolution portfolio piece'}
					style={artworkAdjustFilter(open) ? { filter: artworkAdjustFilter(open) } : undefined}
					className={lightboxIndices.length > 1 ? 'lightbox-clickable' : undefined}
					role={lightboxIndices.length > 1 ? 'button' : undefined}
					tabIndex={lightboxIndices.length > 1 ? 0 : undefined}
					title={lightboxIndices.length > 1 ? 'Show next image' : undefined}
					onClick={lightboxIndices.length > 1 ? () => moveLightbox(1) : undefined}
					onKeyDown={
						lightboxIndices.length > 1
							? (event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										moveLightbox(1);
									}
								}
							: undefined
					}
					onError={
						open.sample
							? (event) => showSampleUnavailable(event.currentTarget)
							: undefined
					}
				/>
				{(open.title || open.description || open.link) && (
					<figcaption id={dialogCaptionId} className="modal-caption">
						{open.title && <span className="modal-caption-title">{open.title}</span>}
						{open.description && <span className="modal-caption-description">{open.description}</span>}
						{open.link && (
							<a className="modal-caption-link" href={safeHref(open.link)} target="_blank" rel="noopener noreferrer">
								View project ↗
							</a>
						)}
					</figcaption>
				)}
			</figure>
			{lightboxIndices.length > 1 && (
				<button
					type="button"
					className="lightbox-nav next"
					aria-label="Show next image"
					onClick={() => moveLightbox(1)}
				>
					▶
				</button>
			)}
		</div>
	) : null;

	return (
		<div
			ref={setGalleryRoot}
			className={`gallery-root ${
				carouselMode ? (embeddedCarousel ? 'carousel-embedded-root' : 'carousel-gallery-root') : ''
			} ${carouselMode && editable ? 'carousel-editable' : ''}`}
			data-phone-ready={isPhone ? 'true' : undefined}
			style={carouselRootStyle}
			tabIndex={editable && carouselMode && !embeddedCarousel ? -1 : undefined}
			onPointerDown={
				carouselMode && editable && !embeddedCarousel
					? (event) => {
							if (event.target === event.currentTarget) setCarouselSelected(false);
						}
					: undefined
			}
		>
			{carouselMode && activeCarouselEntry ? (
				<>
					{editable && !embeddedCarousel && carouselCenterGuide && (
						<div className="carousel-center-guide canvas-center-guide" aria-hidden="true" />
					)}
					{editable && !embeddedCarousel && carouselGuide.kind === 'squares' && (
						<div
							className="carousel-grid-overlay canvas-grid-overlay"
							style={
								{
									'--gn': String(carouselGuide.n),
									'--gh': `${(10000 / (carouselGuide.n * carouselCanvasHeight)).toFixed(4)}%`,
								} as CSSProperties
							}
							aria-hidden="true"
						/>
					)}
					{editable && !embeddedCarousel && carouselGuide.kind === 'columns' && (
						<div className="carousel-column-overlay canvas-column-overlay" aria-hidden="true">
							{columnSpans(carouselGuide.n).map(({ x, w }, index) => (
								<span key={index} style={{ left: `${x}%`, width: `${w}%` }} />
							))}
						</div>
					)}
					<section
						className={`inline-carousel carousel-arrows-${settings?.carouselArrowStyle ?? 'chevron'} carousel-frame-${settings?.carouselFrameStyle ?? 'none'} ${embeddedCarousel ? '' : 'carousel-canvas-item'} ${carouselSelected ? 'selected' : ''} ${artworkEffectClass(activeCarouselEntry.img)}`}
						role="region"
						aria-roledescription="carousel"
						aria-label={`${settings?.alt || alt} carousel`}
						style={carouselItemStyle}
					>
					<div className="inline-carousel-frame">
					<div
						className={`inline-carousel-stage ${carouselFit === 'fill' ? 'fill' : 'fit'}`}
						onPointerDown={
							editable && !embeddedCarousel && onCarouselFrameChange
								? (event) => {
										const target = event.target as HTMLElement;
										if (target.closest('button')) return;
										if (settings?.carouselMoveImage === true && target.closest('img')) return;
										startCarouselFrameGesture(event, 'move');
									}
								: undefined
						}
					>
						<img
							key={activeCarouselEntry.img.id ?? activeCarouselEntry.img.src}
							src={activeCarouselEntry.img.src}
							srcSet={activeCarouselEntry.img.srcSet}
							alt={
								activeCarouselEntry.img.decorative
									? ''
									: activeCarouselEntry.img.alt || activeCarouselEntry.img.title || alt
							}
							className="inline-carousel-image lightbox-trigger"
							decoding="async"
							draggable={false}
							role={activeCarouselHref ? undefined : 'button'}
							tabIndex={activeCarouselHref ? undefined : 0}
							aria-haspopup={activeCarouselHref ? undefined : 'dialog'}
							aria-label={
								activeCarouselHref
									? undefined
									: `Open ${activeCarouselEntry.img.title || activeCarouselEntry.img.alt || alt} in image viewer`
							}
							style={{
								objectPosition: `${
									carouselFocusDraft?.id === activeCarouselEntry.img.id
										? carouselFocusDraft?.x
										: activeCarouselEntry.img.focusX ?? 50
								}% ${
									carouselFocusDraft?.id === activeCarouselEntry.img.id
										? carouselFocusDraft?.y
										: activeCarouselEntry.img.focusY ?? 50
								}%`,
								transformOrigin: `${
									carouselFocusDraft?.id === activeCarouselEntry.img.id
										? carouselFocusDraft?.x
										: activeCarouselEntry.img.focusX ?? 50
								}% ${
									carouselFocusDraft?.id === activeCarouselEntry.img.id
										? carouselFocusDraft?.y
										: activeCarouselEntry.img.focusY ?? 50
								}%`,
								transform: `scale(${carouselZoomDraft?.id === activeCarouselEntry.img.id ? (carouselZoomDraft?.zoom ?? 1) : activeCarouselEntry.img.cropZoom ?? 1})`,
							}}
							onError={
								activeCarouselEntry.img.sample
									? (event) => showSampleUnavailable(event.currentTarget)
									: undefined
							}
							onPointerDown={(event) =>
								startCarouselCrop(
									event,
									activeCarouselEntry.img.id ?? String(activeCarouselEntry.i),
									activeCarouselEntry.img.focusX ?? 50,
									activeCarouselEntry.img.focusY ?? 50,
									activeCarouselEntry.img.cropZoom ?? 1,
								)
							}
							onClick={(event) => {
								if (activeCarouselHref) return;
								if (cropDraggedRef.current || frameDraggedRef.current) {
									cropDraggedRef.current = false;
									frameDraggedRef.current = false;
									return;
								}
								openLightbox(activeCarouselEntry.i, event.currentTarget);
							}}
							onKeyDown={
								activeCarouselHref
									? undefined
									: (event) => openFromKeyboard(event, activeCarouselEntry.i)
							}
						/>
						{editable && settings?.carouselMoveImage === true && onCarouselZoomChange && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
							<span key={corner} className={`canvas-resize carousel-image-resize corner-${corner}`} title={`Resize image from ${corner.toUpperCase()} corner`} onPointerDown={(event) => startCarouselImageResize(event, activeCarouselEntry.img.id ?? String(activeCarouselEntry.i), activeCarouselEntry.img.cropZoom ?? 1, corner)} aria-hidden="true" />
						))}
						{activeCarouselHref && (
							<a
								className="artwork-link-overlay"
								href={activeCarouselHref}
								target={externalImageLink(activeCarouselHref) ? '_blank' : undefined}
								rel={externalImageLink(activeCarouselHref) ? 'noopener noreferrer' : undefined}
								aria-label={`Go to ${activeCarouselEntry.img.title || activeCarouselEntry.img.alt || 'linked image'}`}
								onClick={(event) => onImageLink?.(activeCarouselHref, event)}
							/>
						)}
						{carouselEntries.length > 1 && (
							<>
								<button
									type="button"
									className="inline-carousel-nav previous"
									aria-label="Show previous image"
									onClick={() => moveCarousel(-1)}
								>
									<span aria-hidden="true">
										{settings?.carouselArrowStyle === 'arrow' ? '←' : '‹'}
									</span>
								</button>
								<button
									type="button"
									className="inline-carousel-nav next"
									aria-label="Show next image"
									onClick={() => moveCarousel(1)}
								>
									<span aria-hidden="true">
										{settings?.carouselArrowStyle === 'arrow' ? '→' : '›'}
									</span>
								</button>
							</>
						)}
					</div>
					{editable && !embeddedCarousel && onCarouselFrameChange && settings?.carouselMoveImage !== true && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
						<span key={corner} className={`canvas-resize carousel-frame-resize corner-${corner}`} title={`Resize carousel from ${corner.toUpperCase()} corner`} onPointerDown={(event) => startCarouselFrameGesture(event, 'resize', corner)} aria-hidden="true" />
					))}
					</div>
					{settings?.carouselShowTitle === true && activeCarouselEntry.img.title && (
						<p className="inline-carousel-title">{activeCarouselEntry.img.title}</p>
					)}
					{settings?.carouselShowCount !== false && carouselEntries.length > 1 && (
							<p
								className="inline-carousel-count"
								aria-live="polite"
								aria-label={`Image ${carouselPosition + 1} of ${carouselEntries.length}`}
							>
								{carouselPosition + 1} / {carouselEntries.length}
							</p>
						)}
					</section>
				</>
			) : smartLayout ? (
				<div
					className={`smart-grid ${settings?.galleryWall ? 'gallery-wall' : ''}`}
					style={{
						'--gap-x': `${gridGap(settings?.gapX)}rem`,
						'--gap-y': `${gridGap(settings?.gapY)}rem`,
						'--mobile-cols': String(settings?.mobile?.columns ?? 1),
					} as CSSProperties}
				>
					{smartLayout.rows.map((row, rowIndex) => {
						const spacer =
							rowIndex === smartLayout.rows.length - 1 && smartLayout.rows.length > 1
								? lastRowSpacer(row.map((entry) => smartLayout.ars[entry]), smartLayout.target)
								: 0;
						return (
							<div className="smart-row" key={renderedImages[row[0]].img.id ?? row[0]}>
								{row.map((entry) => {
									const { img, i } = renderedImages[entry];
									const ar = smartLayout.ars[entry];
									const href = editable ? undefined : imageClickHref(img);
									const phoneKey = imagePhoneKey(img, i);
									const jitter = settings?.galleryWall ? wallJitter(img.id ?? phoneKey) : null;
									return (
										<div
											className={`smart-item${jitter ? ` wall-y-${jitter.alignY}` : ''}`}
											style={{
												...phoneItemVars(settings, phoneKey, i),
												'--flex-ar': String(ar),
											} as CSSProperties}
											key={img.id ?? `${img.src}-${i}`}
										>
											{/* Artwork effects live on the box whose direct child is the
											    img — every ArtworkEffects.css rule targets `> img`, so on
											    the outer cell they would all silently miss. */}
											<span
												className={`smart-art ${artworkEffectClass(img)}${jitter ? ` wall-x-${jitter.alignX}` : ''}${img.cropAspect || (img.cropZoom ?? 1) > 1 ? ' has-native-crop' : ''}`}
												style={{
													...artworkEffectStyle(img),
													...(jitter ? { '--wall-scale': String(Math.round(jitter.scale * 1000) / 1000) } : {}),
												} as CSSProperties}
											>
												<img
													src={img.src}
													srcSet={img.srcSet}
													alt={img.decorative ? '' : img.alt || img.title || alt}
													className={!editable && !href ? 'lightbox-trigger' : undefined}
													loading="lazy"
													decoding="async"
													role={!editable && !href ? 'button' : undefined}
													tabIndex={!editable && !href ? 0 : undefined}
													aria-haspopup={!editable && !href ? 'dialog' : undefined}
													aria-label={
														!editable && !href
															? `Open ${img.title || img.alt || alt} in image viewer`
															: undefined
													}
													style={{
														...nativeCropStyle(img),
														...(parseAspect(img.cropAspect)
															? {}
															: { aspectRatio: String(ar), objectFit: 'cover' as const }),
													}}
													onLoad={
														img.ar === undefined && !parseAspect(img.cropAspect)
															? (e) => measureSmartAr(phoneKey, e.currentTarget)
															: undefined
													}
													onError={
														img.sample
															? (event) => showSampleUnavailable(event.currentTarget)
															: undefined
													}
													onClick={!editable && !href ? (e) => openLightbox(i, e.currentTarget) : undefined}
													onKeyDown={!editable && !href ? (e) => openFromKeyboard(e, i) : undefined}
												/>
												{img.title && (
													<span className="motion-caption" aria-hidden="true">
														{img.title}
													</span>
												)}
												{href && (
													<a
														className="artwork-link-overlay"
														href={href}
														target={externalImageLink(href) ? '_blank' : undefined}
														rel={externalImageLink(href) ? 'noopener noreferrer' : undefined}
														aria-label={`Go to ${img.title || img.alt || 'linked image'}`}
														onClick={(event) => onImageLink?.(href, event)}
													/>
												)}
											</span>
										</div>
									);
								})}
								{spacer > 0 && (
									<div
										className="smart-spacer"
										style={{ '--flex-ar': String(Math.round(spacer * 1000) / 1000) } as CSSProperties}
										aria-hidden="true"
									/>
								)}
							</div>
						);
					})}
				</div>
			) : uniformMode ? (
				<div
					className={`uniform-grid ${cellAr ? 'cropped' : ''}`}
					style={{
						'--cols': String(cols),
						'--cell-ar': cellAr ? String(cellAr) : undefined,
						'--gap-x': `${gridGap(settings?.gapX)}rem`,
						'--gap-y': `${gridGap(settings?.gapY)}rem`,
						'--mobile-cols': String(settings?.mobile?.columns ?? 1),
					} as CSSProperties}
				>
					{renderedImages.map(({ img, i }) => {
						const href = editable ? undefined : imageClickHref(img);
						return (
							<div
								className={`uniform-item ${artworkEffectClass(img)} ${img.cropAspect || (img.cropZoom ?? 1) > 1 ? 'has-native-crop' : ''}`}
								style={{
									...phoneItemVars(settings, imagePhoneKey(img, i), i),
									...artworkEffectStyle(img),
								}}
								key={img.id ?? `${img.src}-${i}`}
							>
								<img
									src={img.src}
									srcSet={img.srcSet}
									alt={img.decorative ? '' : img.alt || img.title || alt}
									className={!editable && !href ? 'lightbox-trigger' : undefined}
									loading="lazy"
									decoding="async"
									role={!editable && !href ? 'button' : undefined}
									tabIndex={!editable && !href ? 0 : undefined}
									aria-haspopup={!editable && !href ? 'dialog' : undefined}
									aria-label={
										!editable && !href
											? `Open ${img.title || img.alt || alt} in image viewer`
											: undefined
									}
									style={nativeCropStyle(img)}
									onError={
										img.sample
											? (event) => showSampleUnavailable(event.currentTarget)
											: undefined
									}
									onClick={!editable && !href ? (e) => openLightbox(i, e.currentTarget) : undefined}
									onKeyDown={!editable && !href ? (e) => openFromKeyboard(e, i) : undefined}
								/>
								{img.title && (
									<span className="motion-caption" aria-hidden="true">
										{img.title}
									</span>
								)}
								{href && (
									<a
										className="artwork-link-overlay"
										href={href}
										target={externalImageLink(href) ? '_blank' : undefined}
										rel={externalImageLink(href) ? 'noopener noreferrer' : undefined}
										aria-label={`Go to ${img.title || img.alt || 'linked image'}`}
										onClick={(event) => onImageLink?.(href, event)}
									/>
								)}
							</div>
						);
					})}
				</div>
			) : canvasMode ? (
				<CanvasGallery
					images={images}
					texts={texts}
					embeds={embeds}
					widgets={[...canvasWidgets, ...canvasCarouselWidgets]}
					alt={alt}
					mobile={settings?.mobile}
					phoneActive={isPhone}
					autoFlowFloor={autoFlowFloor}
					editable={editable}
					onLayoutChange={onLayoutChange}
					onImageMount={onImageMount}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onWidgetLayout={onCarouselWidgetLayout}
					onBulkLayoutChange={onBulkLayoutChange}
					onDeleteSelection={onDeleteSelection}
					onOpen={editable ? undefined : openLightbox}
					onImageLink={onImageLink}
					onSelectBlock={onSelectBlock}
					inlineTextEditing={inlineTextEditing}
				/>
			) : (
				<div className="masonry-grid">
					{renderedImages.map(({ img, i }) => {
						const href = imageClickHref(img);
						return (
							<div
								className={`masonry-item ${artworkEffectClass(img)} ${img.cropAspect || (img.cropZoom ?? 1) > 1 ? 'has-native-crop' : ''}`}
								style={{
									...spanVars(img),
									...phoneItemVars(settings, imagePhoneKey(img, i), i),
									...artworkEffectStyle(img),
								}}
								key={img.id ?? `${img.src}-${i}`}
							>
								<img
									src={img.src}
									srcSet={img.srcSet}
									alt={img.decorative ? '' : img.alt || img.title || alt}
									className={href ? undefined : 'lightbox-trigger'}
									loading="lazy"
									decoding="async"
									role={href ? undefined : 'button'}
									tabIndex={href ? undefined : 0}
									aria-haspopup={href ? undefined : 'dialog'}
									aria-label={href ? undefined : `Open ${img.title || img.alt || alt} in image viewer`}
									style={nativeCropStyle(img)}
									onError={
										img.sample
											? (event) => showSampleUnavailable(event.currentTarget)
											: undefined
									}
									onClick={href ? undefined : (e) => openLightbox(i, e.currentTarget)}
									onKeyDown={href ? undefined : (e) => openFromKeyboard(e, i)}
								/>
								{img.title && (
									<span className="motion-caption" aria-hidden="true">
										{img.title}
									</span>
								)}
								{href && (
									<a
										className="artwork-link-overlay"
										href={href}
										target={externalImageLink(href) ? '_blank' : undefined}
										rel={externalImageLink(href) ? 'noopener noreferrer' : undefined}
										aria-label={`Go to ${img.title || img.alt || 'linked image'}`}
										onClick={(event) => onImageLink?.(href, event)}
									/>
								)}
							</div>
						);
					})}
				</div>
			)}

			{host ? createPortal(modal, host) : null}
		</div>
	);
}
