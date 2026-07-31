// Freeform canvas — the modern replacement for the span grid. Each image sits
// at its stored {x, y, w} (percentages of the canvas width, y included, so the
// whole composition scales proportionally) with height fixed by its aspect
// ratio; text blocks and hosted embeds pinned to the canvas render the same way
// (texts with automatic height, embeds with provider-appropriate ratios). On the published site it
// renders static; in the editor preview the same component turns interactive:
// drag to move, drag the corner handle to resize, with an optional grid overlay
// and snap-to-grid (both controlled from the editor panel via gridPrefs).
// Every change reports back through onLayoutChange / onTextLayout /
// onEmbedLayout. Images without a stored layout yet are auto-flowed into rows
// (flowMissing) and, in the editor, committed once their real aspect ratio is
// measured.
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import type {
	CanvasEmbed,
	CanvasLayoutUpdates,
	CanvasSelection,
	CanvasText,
	ImageLayout,
	ResolvedImage,
	TextLayout,
} from './types';
import type { MobileComposition } from '../lib/content';
import {
	bottomOf,
	canvasHeight,
	clampLayout,
	clampTextLayout,
	columnEdges,
	columnSpans,
	DEFAULT_AR,
	EDGE_SNAP,
	flowMissing,
	MIN_EMBED_W,
	MIN_TEXT_W,
	MIN_W,
	nearestEdge,
	pointerInCanvas,
	roundLayout,
	roundTextLayout,
	snapSpanToEdges,
	snapSpanToCenter,
	snapTo,
	snapToEdges,
	textBottom,
} from './canvasLayout';
import { guideById, useGridPrefs } from './gridPrefs';
import { embedKindForInput, embedKindLabel, embedSpec } from './mediaEmbed';
import { stripePaymentLink } from './paymentEmbed';
import { safeHref } from './safeHref';
import { showSampleUnavailable } from './sampleFallback';
import { TextContent } from './TextBlock';
import { automaticPhoneOrder } from './mobileOrder';
import { artworkEffectClass, artworkEffectStyle } from './artworkEffects';
import './Gallery.css';
import './ArtworkEffects.css';

const imageClickHref = (image: ResolvedImage): string | undefined =>
	image.clickAction === 'link' ? safeHref(image.link) : undefined;

const externalImageLink = (href: string): boolean => /^https?:/i.test(href);

export interface CanvasGalleryProps {
	images: ResolvedImage[];
	/** Text blocks pinned to the canvas, rendered inside the composition. */
	texts?: CanvasText[];
	/** Hosted players/maps pinned to the canvas, rendered inside the composition. */
	embeds?: CanvasEmbed[];
	/** Self-contained blocks, such as carousels, placed on this same canvas. */
	widgets?: CanvasWidget[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: enables move/resize instead of the lightbox. */
	editable?: boolean;
	/** Optional phone-only order, size and visibility. Absent = automatic. */
	mobile?: MobileComposition;
	/** True when this hydrated gallery is currently inside the phone breakpoint. */
	phoneActive?: boolean;
	/** New/unplaced images begin below earlier freeform items in the section. */
	autoFlowFloor?: number;
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize (and height re-measures) per pinned text. */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned hosted embed. */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize for a self-contained canvas widget. */
	onWidgetLayout?: (id: string, layout: ImageLayout) => void;
	/** Reports one finished mixed-item move so the editor can commit one undo step. */
	onBulkLayoutChange?: (updates: CanvasLayoutUpdates) => void;
	/** Deletes the current canvas selection as one undoable edit. */
	onDeleteSelection?: (selection: CanvasSelection) => void;
	/** Published site: open the lightbox for image i and restore focus to its trigger afterwards. */
	onOpen?: (index: number, trigger?: HTMLElement) => void;
	/** Editor preview: keep internal image links inside the preview router. */
	onImageLink?: (url: string, event: ReactMouseEvent<HTMLElement>) => void;
}

export interface CanvasWidget {
	id: string;
	layout: ImageLayout;
	freeResize?: boolean;
	/** Let pointer drags on the widget image reposition that image instead of moving the widget. */
	moveImage?: boolean;
	content: ReactNode;
}

export default function CanvasGallery({
	images,
	texts = [],
	embeds = [],
	widgets = [],
	alt = 'Portfolio piece',
	editable = false,
	mobile,
	phoneActive = false,
	autoFlowFloor = 0,
	onLayoutChange,
	onTextLayout,
	onEmbedLayout,
	onWidgetLayout,
	onBulkLayoutChange,
	onDeleteSelection,
	onOpen,
	onImageLink,
}: CanvasGalleryProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	/** Live position of the item being dragged, keyed by id (committed on release). */
	const [drafts, setDrafts] = useState<Record<string, ImageLayout>>({});
	const draftsRef = useRef(drafts);
	draftsRef.current = drafts;
	/** Same, for pinned texts. */
	const [textDrafts, setTextDrafts] = useState<Record<string, TextLayout>>({});
	const textDraftsRef = useRef(textDrafts);
	textDraftsRef.current = textDrafts;
	/** Keeps height re-measurement from overwriting a just-committed move before
	 * the updated editor document has rendered back through the iframe. */
	const committedTextLayouts = useRef<Record<string, TextLayout>>({});
	/** Aspect ratios measured from the loaded pixels (editor only). */
	const [measured, setMeasured] = useState<Record<string, number>>({});
	const [dragId, setDragId] = useState<string | null>(null);
	const [dragGesture, setDragGesture] = useState<'move' | 'resize' | null>(null);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [marquee, setMarquee] = useState<
		{ x: number; y: number; w: number; h: number } | null
	>(null);
	const [centerGuide, setCenterGuide] = useState(false);
	const textEls = useRef<Record<string, HTMLDivElement | null>>({});
	const draggedClickRef = useRef<string | null>(null);
	const gridPrefs = useGridPrefs();

	// Snap targets follow the chosen guide: square guides snap x AND y to the
	// cell size; column guides snap x (and the resized right edge) to column
	// edges, leaving y free. Identity functions when guides/snap are off.
	const guide = guideById(gridPrefs.guide);
	const snapOn = editable && gridPrefs.snap && guide.kind !== 'off';
	const squareStep = snapOn && guide.kind === 'squares' ? 100 / guide.n : 0;
	const xEdges = snapOn && guide.kind === 'columns' ? columnEdges(guide.n) : [];
	const snapX = (v: number): number => (xEdges.length ? snapToEdges(v, xEdges) : snapTo(v, squareStep));
	const snapY = (v: number): number => snapTo(v, squareStep);

	// On by default in the editor, guides or not; a neighbor edge within EDGE_SNAP wins
	// over the coarser guide snap. Toggleable (toolbar checkbox / Shift+S) for the rare
	// composition where near-misses should stay near-misses.
	const edgeSnapOn = editable && gridPrefs.edgeSnap;

	/**
	 * Every OTHER item's edges (x: left/right, y: top/bottom), so a drag can
	 * magnetically align with its neighbors — e.g. two images sharing the exact
	 * same top or bottom line.
	 */
	const neighborEdges = (excluded: ReadonlySet<string>): { xs: number[]; ys: number[] } => {
		if (!edgeSnapOn) return { xs: [], ys: [] };
		const xs: number[] = [];
		const ys: number[] = [];
		images.forEach((img, i) => {
			if (excluded.has(`image:${img.id ?? keyOf(img, i)}`)) return;
			const l = layouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		embeds.forEach((v, i) => {
			if (excluded.has(`video:${v.id}`)) return;
			const l = embedLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		widgets.forEach((widget, i) => {
			if (excluded.has(`widget:${widget.id}`)) return;
			const l = widgetLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		shownTexts.forEach((t, i) => {
			if (excluded.has(`text:${t.id}`)) return;
			const l = textLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, textBottom(l));
		});
		return { xs, ys };
	};

	const keyOf = (img: ResolvedImage, i: number): string => img.id ?? `${img.src}-${i}`;
	const imageSelectionKey = (img: ResolvedImage, i: number): string =>
		`image:${keyOf(img, i)}`;

	// Empty pinned texts stay draggable in the editor; on the site they render nothing.
	const shownTexts = editable ? texts : texts.filter((t) => t.text.trim());

	const textLayouts = shownTexts.map((t) => textDrafts[t.id] ?? t.layout);
	const embedLayouts = embeds.map((v) => drafts[v.id] ?? v.layout);
	const widgetLayouts = widgets.map((widget) => drafts[widget.id] ?? widget.layout);
	// Effective layout per item: in-flight draft > stored > auto-flowed default.
	const flowed = flowMissing(
		images.map((img, i) => ({ layout: img.layout, ar: measured[keyOf(img, i)] ?? img.ar })),
		autoFlowFloor,
	);
	const layouts = images.map(
		(img, i) => drafts[keyOf(img, i)] ?? img.layout ?? flowed.get(i) ?? { x: 0, y: 0, w: 30, ar: DEFAULT_AR },
	);
	const height = Math.max(
		canvasHeight(layouts),
		...textLayouts.map(textBottom),
		...embedLayouts.map(bottomOf),
		...widgetLayouts.map(bottomOf),
		editable ? 30 : 1,
	);
	const multiSelected = selected.size > 1;

	const selectionItems = () => [
		...images.map((img, index) => {
			const layout = layouts[index];
			return {
				key: imageSelectionKey(img, index),
				id: keyOf(img, index),
				kind: 'image' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
		...embeds.map((embed, index) => {
			const layout = embedLayouts[index];
			return {
				key: `video:${embed.id}`,
				id: embed.id,
				kind: 'embed' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
		...shownTexts.map((text, index) => {
			const layout = textLayouts[index];
			return {
				key: `text:${text.id}`,
				id: text.id,
				kind: 'text' as const,
				layout,
				height: textBottom(layout) - layout.y,
			};
		}),
		...widgets.map((widget, index) => {
			const layout = widgetLayouts[index];
			return {
				key: `widget:${widget.id}`,
				id: widget.id,
				kind: 'widget' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
	];

	useEffect(() => {
		if (!editable) {
			setSelected(new Set());
			return;
		}
		const canvas = canvasRef.current;
		const doc = canvas?.ownerDocument;
		if (!doc || !canvas) return;
		const hostDoc = doc.defaultView?.frameElement?.ownerDocument;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setSelected(new Set());
				return;
			}
			if (
				(event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'Del') ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				!onDeleteSelection ||
				selected.size === 0
			) return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.matches('input, textarea, select') ||
					target.isContentEditable ||
					!!target.closest('[contenteditable="true"]'))
			) return;
			// Several canvases can coexist on a page. Only the one that last took
			// pointer focus owns the shortcut, even if another retains stale selection.
			if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) return;
			const selection: CanvasSelection = {};
			for (const key of selected) {
				const separator = key.indexOf(':');
				const kind = key.slice(0, separator);
				const id = key.slice(separator + 1);
				if (!id) continue;
				if (kind === 'image') (selection.images ??= []).push(id);
				else if (kind === 'text') (selection.texts ??= []).push(id);
				else if (kind === 'video') (selection.embeds ??= []).push(id);
				else if (kind === 'widget') (selection.widgets ??= []).push(id);
			}
			event.preventDefault();
			event.stopPropagation();
			onDeleteSelection(selection);
			setSelected(new Set());
		};
		doc.addEventListener('keydown', onKey);
		if (hostDoc && hostDoc !== doc) hostDoc.addEventListener('keydown', onKey);
		return () => {
			doc.removeEventListener('keydown', onKey);
			if (hostDoc && hostDoc !== doc) hostDoc.removeEventListener('keydown', onKey);
		};
	}, [editable, onDeleteSelection, selected]);

	const centeredX = (x: number, w: number): number => {
		if (!editable || !gridPrefs.centerSnap) {
			setCenterGuide(false);
			return x;
		}
		const result = snapSpanToCenter(x, w);
		setCenterGuide(result.snapped);
		return result.value;
	};

	// Phones stack the canvas as one column — interleave images, texts and embeds
	// by their vertical position so the stacking follows the composition, not the
	// DOM order.
	const automaticKeys = automaticPhoneOrder([
		...images.map((img, i) => ({ key: `image:${keyOf(img, i)}`, y: layouts[i].y, kind: 'image' as const, index: i })),
		...shownTexts.map((t, i) => ({ key: `text:${t.id}`, y: textLayouts[i].y, kind: 'text' as const, index: i })),
		...embeds.map((v, i) => ({ key: `video:${v.id}`, y: embedLayouts[i].y, kind: 'video' as const, index: i })),
		...widgets.map((widget, i) => ({ key: `widget:${widget.id}`, y: widgetLayouts[i].y, kind: 'image' as const, index: images.length + i })),
	]);
	const automaticOrderOf = new Map(automaticKeys.map((key, rank) => [key, rank]));
	const requestedOrderOf = new Map((mobile?.order ?? []).map((key, rank) => [key, rank]));
	const phoneVars = (key: string): CSSProperties => {
		const automaticOrder = automaticOrderOf.get(key) ?? 0;
		const requestedOrder = requestedOrderOf.get(key);
		const style = mobile?.items?.[key];
		const width = style?.width ?? 100;
		const align = style?.align ?? 'center';
		return {
			'--mobile-order': String(requestedOrder ?? requestedOrderOf.size + automaticOrder),
			'--mobile-width': String(width),
			'--mobile-display': style?.hidden ? 'none' : 'block',
			'--mobile-margin-left': align === 'left' ? '0' : 'auto',
			'--mobile-margin-right': align === 'right' ? '0' : 'auto',
		} as CSSProperties;
	};
	const renderItems = [
		...images.map((_, index) => ({ type: 'image' as const, index, key: `image:${keyOf(images[index], index)}` })),
		...embeds.map((embed, index) => ({ type: 'embed' as const, index, key: `video:${embed.id}` })),
		...widgets.map((widget, index) => ({ type: 'widget' as const, index, key: `widget:${widget.id}` })),
		...shownTexts.map((text, index) => ({ type: 'text' as const, index, key: `text:${text.id}` })),
	];
	if (phoneActive)
		renderItems.sort((a, b) => {
			const aRequested = requestedOrderOf.get(a.key);
			const bRequested = requestedOrderOf.get(b.key);
			const aOrder = aRequested ?? requestedOrderOf.size + (automaticOrderOf.get(a.key) ?? 0);
			const bOrder = bRequested ?? requestedOrderOf.size + (automaticOrderOf.get(b.key) ?? 0);
			return aOrder - bOrder;
		});

	// Overlap (z) order matches the editor panel like a layers list: the TOP image
	// there sits in FRONT here, so z-index descends down the list. Pinned videos
	// and texts keep stacking above every image (as their DOM order always had it).
	// The dragged item jumps above everything, including the grid overlay (5000).
	const DRAG_Z = 6000;
	const imageZ = (i: number) => images.length - i;
	const embedZ = (i: number) => images.length + embeds.length - i;
	const textZ = (i: number) => images.length + embeds.length + shownTexts.length - i;
	const widgetZ = (i: number) => images.length + embeds.length + shownTexts.length + widgets.length - i;

	const measure = (key: string, el: HTMLImageElement) => {
		if (el.naturalWidth && el.naturalHeight)
			setMeasured((m) => (m[key] ? m : { ...m, [key]: el.naturalWidth / el.naturalHeight }));
	};

	// Editor: once every unplaced image has a measured aspect ratio, persist the
	// auto-flowed positions so the gallery converts to the canvas system exactly
	// as previewed. Runs once per gallery — afterwards every image has a layout.
	useEffect(() => {
		if (!editable || !onLayoutChange) return;
		const missing = images
			.map((img, i) => ({ img, i }))
			.filter(({ img }) => !img.layout && img.id);
		if (missing.length === 0) return;
		if (!missing.every(({ img, i }) => measured[keyOf(img, i)])) return;
		for (const { img, i } of missing) {
			const layout = flowed.get(i);
			if (layout) onLayoutChange(img.id!, roundLayout(layout));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editable, onLayoutChange, images, measured]);

	// Editor: keep each pinned text's stored height in sync with its rendered
	// height (it changes when the text or its width changes), so the canvas can
	// reserve room for it on the published site. The 0.5% tolerance stops the
	// measure->commit cycle from ping-ponging.
	useEffect(() => {
		if (!editable || !onTextLayout || dragId) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const width = canvas.getBoundingClientRect().width;
		if (!width) return;
		for (const t of texts) {
			const el = textEls.current[t.id];
			if (!el) continue;
			const committed = committedTextLayouts.current[t.id];
			if (
				committed &&
				t.layout.x === committed.x &&
				t.layout.y === committed.y &&
				t.layout.w === committed.w
			) {
				delete committedTextLayouts.current[t.id];
			}
			const base = committed ?? t.layout;
			const h = (el.offsetHeight * 100) / width;
			if (Math.abs((base.h ?? 0) - h) > 0.5)
				onTextLayout(t.id, roundTextLayout({ ...base, h }));
		}
	});

	/** Shared move/resize wiring for images and embeds (both use ImageLayout). */
	const startItemDrag = (
		e: React.PointerEvent,
		id: string,
		selectionKey: string,
		from: ImageLayout,
		mode: 'move' | 'resize',
		minW: number,
		commit: (id: string, layout: ImageLayout) => void,
		freeResize = false,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The full-canvas shield below is the fallback for older WebViews.
		}
		canvas.focus({ preventScroll: true });
		// Inside the phone-preview iframe the drag must listen on THAT window.
		const win = canvas.ownerDocument.defaultView ?? window;
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const { xs, ys } = neighborEdges(new Set([selectionKey]));
		let finalDraft: ImageLayout | undefined;
		draggedClickRef.current = null;
		setDragId(id);
		setDragGesture(mode);
		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const dx = current.x - origin.x;
			const dy = current.y - origin.y;
			if (Math.abs(dx) + Math.abs(dy) > 0.3) draggedClickRef.current = id;
			const h = from.w / from.ar;
			let next: ImageLayout;
			if (mode === 'move') {
				// Guide snap first, then let a nearby neighbor edge take over so the
				// item's top/bottom (or sides) lines up exactly with its neighbors'.
				const edgeX = snapSpanToEdges(snapX(from.x + dx), from.w, xs);
				const x = centeredX(edgeX, from.w);
				const y = snapSpanToEdges(snapY(from.y + dy), h, ys);
				next = { ...from, x, y };
			} else {
				setCenterGuide(false);
				if (freeResize) {
					let width = Math.min(Math.max(from.w + dx, minW), 100 - from.x);
					let height = Math.max(from.w / from.ar + dy, MIN_W);
					const snappedRight = nearestEdge(from.x + width, xs, EDGE_SNAP);
					const snappedBottom = nearestEdge(from.y + height, ys, EDGE_SNAP);
					width =
						snappedRight === null
							? Math.max(snapX(from.x + width) - from.x, minW)
							: Math.max(snappedRight - from.x, minW);
					height =
						snappedBottom === null
							? Math.max(snapY(from.y + height) - from.y, MIN_W)
							: Math.max(snappedBottom - from.y, MIN_W);
					next = { ...from, w: width, ar: Math.min(Math.max(width / height, 0.2), 5) };
					finalDraft = clampLayout(next);
					setDrafts((d) => ({ ...d, [id]: finalDraft! }));
					return;
				}
				// Snap the RIGHT edge to the guides so resized items line up with
				// columns — unless a neighbor's edge is closer: right edge to a
				// neighbor's side, or bottom edge to a neighbor's top/bottom.
				const w = Math.min(from.w + Math.max(dx, dy * from.ar), 100 - from.x);
				const right = nearestEdge(from.x + w, xs, EDGE_SNAP);
				const bottom = nearestEdge(from.y + w / from.ar, ys, EDGE_SNAP);
				const wRight = right === null ? null : right - from.x;
				const wBottom = bottom === null ? null : (bottom - from.y) * from.ar;
				const dRight = wRight === null ? Infinity : Math.abs(wRight - w);
				const dBottom = wBottom === null ? Infinity : Math.abs(wBottom - w);
				const snapped =
					dRight <= dBottom && dRight < Infinity
						? (wRight as number)
						: dBottom < Infinity
							? (wBottom as number)
							: snapX(from.x + w) - from.x;
				next = { ...from, w: Math.max(snapped, minW) };
			}
			finalDraft = clampLayout(next);
			setDrafts((d) => ({ ...d, [id]: finalDraft! }));
		};
		const move = (ev: PointerEvent) => {
			lastPointer = { x: ev.clientX, y: ev.clientY };
			update(ev.clientX, ev.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const done = finalDraft ?? draftsRef.current[id];
			if (done) commit(id, roundLayout(done));
			setDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	const startGroupDrag = (e: React.PointerEvent) => {
		if (!editable || e.button !== 0 || selected.size < 2) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.focus({ preventScroll: true });
		const chosen = selectionItems().filter((item) => selected.has(item.key));
		if (chosen.length < 2) return;
		e.preventDefault();
		e.stopPropagation();
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The drag shield keeps pointer events out of hosted iframes.
		}
		const win = canvas.ownerDocument.defaultView ?? window;
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const left = Math.min(...chosen.map((item) => item.layout.x));
		const top = Math.min(...chosen.map((item) => item.layout.y));
		const right = Math.max(...chosen.map((item) => item.layout.x + item.layout.w));
		const bottom = Math.max(
			...chosen.map((item) => item.layout.y + item.height),
		);
		const groupW = right - left;
		const groupH = bottom - top;
		const { xs, ys } = neighborEdges(new Set(chosen.map((item) => item.key)));
		let finalDrafts: Record<string, ImageLayout> = {};
		let finalTextDrafts: Record<string, TextLayout> = {};
		setDragId('__group__');
		setDragGesture('move');

		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const rawDx = current.x - origin.x;
			const rawDy = current.y - origin.y;
			const proposedLeft = Math.min(Math.max(left + rawDx, 0), 100 - groupW);
			const edgeLeft = snapSpanToEdges(snapX(proposedLeft), groupW, xs);
			const snappedLeft = Math.min(
				Math.max(centeredX(edgeLeft, groupW), 0),
				100 - groupW,
			);
			const proposedTop = Math.max(top + rawDy, 0);
			const snappedTop = Math.max(
				snapSpanToEdges(snapY(proposedTop), groupH, ys),
				0,
			);
			const dx = snappedLeft - left;
			const dy = snappedTop - top;
			const nextDrafts: Record<string, ImageLayout> = {};
			const nextTexts: Record<string, TextLayout> = {};
			for (const item of chosen) {
				if (item.kind === 'text') {
					nextTexts[item.id] = clampTextLayout({
						...(item.layout as TextLayout),
						x: item.layout.x + dx,
						y: item.layout.y + dy,
					});
				} else {
					nextDrafts[item.id] = clampLayout({
						...(item.layout as ImageLayout),
						x: item.layout.x + dx,
						y: item.layout.y + dy,
					});
				}
			}
			finalDrafts = nextDrafts;
			finalTextDrafts = nextTexts;
			setDrafts((current) => ({ ...current, ...nextDrafts }));
			setTextDrafts((current) => ({ ...current, ...nextTexts }));
		};
		const move = (event: PointerEvent) => {
			lastPointer = { x: event.clientX, y: event.clientY };
			update(event.clientX, event.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);

		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const updates: CanvasLayoutUpdates = {};
			for (const item of chosen) {
				if (item.kind === 'text') {
					const layout = finalTextDrafts[item.id] ?? textDraftsRef.current[item.id];
					if (layout) {
						committedTextLayouts.current[item.id] = layout;
						(updates.texts ??= {})[item.id] = roundTextLayout(layout);
					}
				} else {
					const layout = finalDrafts[item.id] ?? draftsRef.current[item.id];
					if (!layout) continue;
					if (item.kind === 'image')
						(updates.images ??= {})[item.id] = roundLayout(layout);
					else if (item.kind === 'embed')
						(updates.embeds ??= {})[item.id] = roundLayout(layout);
					else (updates.widgets ??= {})[item.id] = roundLayout(layout);
				}
			}
			if (updates.images || updates.texts || updates.embeds || updates.widgets) {
				if (onBulkLayoutChange) onBulkLayoutChange(updates);
				else {
					for (const [id, layout] of Object.entries(updates.images ?? {}))
						onLayoutChange?.(id, layout);
					for (const [id, layout] of Object.entries(updates.texts ?? {}))
						onTextLayout?.(id, layout);
					for (const [id, layout] of Object.entries(updates.embeds ?? {}))
						onEmbedLayout?.(id, layout);
					for (const [id, layout] of Object.entries(updates.widgets ?? {}))
						onWidgetLayout?.(id, layout);
				}
			}
			setDrafts((current) => {
				const next = { ...current };
				for (const item of chosen) if (item.kind !== 'text') delete next[item.id];
				return next;
			});
			setTextDrafts((current) => {
				const next = { ...current };
				for (const item of chosen) if (item.kind === 'text') delete next[item.id];
				return next;
			});
		};

		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	const startMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!editable || event.button !== 0 || event.target !== event.currentTarget) return;
		event.preventDefault();
		const canvas = event.currentTarget;
		canvas.focus({ preventScroll: true });
		const win = canvas.ownerDocument.defaultView ?? window;
		const rect = canvas.getBoundingClientRect();
		const scale = 100 / rect.width;
		const originX = Math.min(Math.max((event.clientX - rect.left) * scale, 0), 100);
		const originY = Math.max((event.clientY - rect.top) * scale, 0);
		const candidates = selectionItems();
		const base = event.shiftKey ? new Set(selected) : new Set<string>();
		let moved = false;

		const move = (next: PointerEvent) => {
			const x2 = Math.min(Math.max((next.clientX - rect.left) * scale, 0), 100);
			const y2 = Math.max((next.clientY - rect.top) * scale, 0);
			const box = {
				x: Math.min(originX, x2),
				y: Math.min(originY, y2),
				w: Math.abs(x2 - originX),
				h: Math.abs(y2 - originY),
			};
			moved = moved || box.w > 0.25 || box.h > 0.25;
			setMarquee(box);
			const nextSelection = new Set(base);
			for (const item of candidates) {
				const intersects =
					item.layout.x < box.x + box.w &&
					item.layout.x + item.layout.w > box.x &&
					item.layout.y < box.y + box.h &&
					item.layout.y + item.height > box.y;
				if (intersects) nextSelection.add(item.key);
			}
			setSelected(nextSelection);
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			setMarquee(null);
			if (!moved && !event.shiftKey) setSelected(new Set());
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
	};

	const startDrag = (e: React.PointerEvent, img: ResolvedImage, index: number, mode: 'move' | 'resize') => {
		if (!editable || !img.id || e.button !== 0 || !onLayoutChange) return;
		canvasRef.current?.focus({ preventScroll: true });
		const key = imageSelectionKey(img, index);
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(e, img.id, key, layouts[index], mode, MIN_W, onLayoutChange);
	};

	const startEmbedDrag = (e: React.PointerEvent, embed: CanvasEmbed, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0 || !onEmbedLayout) return;
		canvasRef.current?.focus({ preventScroll: true });
		const key = `video:${embed.id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(e, embed.id, key, embedLayouts[index], mode, MIN_EMBED_W, onEmbedLayout);
	};

	const startWidgetDrag = (e: React.PointerEvent, widget: CanvasWidget, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0 || !onWidgetLayout) return;
		const target = e.target as HTMLElement;
		if (
			mode === 'move' &&
			target.closest(
				widget.moveImage
					? 'button, a, .inline-carousel-image'
					: 'button, a',
			)
		) return;
		const key = `widget:${widget.id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			canvasRef.current?.focus({ preventScroll: true });
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(
			e,
			widget.id,
			key,
			widgetLayouts[index],
			mode,
			MIN_W,
			onWidgetLayout,
			widget.freeResize === true,
		);
	};

	const startTextDrag = (e: React.PointerEvent, text: CanvasText, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.focus({ preventScroll: true });
		e.preventDefault();
		e.stopPropagation();
		const id = text.id;
		const selectionKey = `text:${id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(selectionKey)) next.delete(selectionKey);
				else next.add(selectionKey);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(selectionKey) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The drag shield keeps pointer events out of hosted iframes.
		}
		setSelected(new Set([selectionKey]));
		const win = canvas.ownerDocument.defaultView ?? window;
		const from = textLayouts[index];
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const { xs, ys } = neighborEdges(new Set([selectionKey]));
		const fromH = textBottom(from) - from.y;
		let finalDraft: TextLayout | undefined;
		setDragId(id);
		setDragGesture(mode);
		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const dx = current.x - origin.x;
			const dy = current.y - origin.y;
			const next =
				mode === 'move'
					? {
							...from,
							x: centeredX(
								snapSpanToEdges(snapX(from.x + dx), from.w, xs),
								from.w,
							),
							y: snapSpanToEdges(snapY(from.y + dy), fromH, ys),
						}
					: {
							...from,
							w: Math.max(snapX(from.x + from.w + dx) - from.x, MIN_TEXT_W),
						};
			if (mode === 'resize') setCenterGuide(false);
			finalDraft = clampTextLayout(next);
			setTextDrafts((d) => ({ ...d, [id]: finalDraft! }));
		};
		const move = (ev: PointerEvent) => {
			lastPointer = { x: ev.clientX, y: ev.clientY };
			update(ev.clientX, ev.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const done = finalDraft ?? textDraftsRef.current[id];
			if (done && onTextLayout) {
				committedTextLayouts.current[id] = done;
				onTextLayout(id, roundTextLayout(done));
			}
			setTextDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	return (
		<div
			ref={canvasRef}
			className={`canvas-gallery ${editable ? 'editable' : ''}`}
			style={{ '--ch': String(height) } as CSSProperties}
			tabIndex={editable ? -1 : undefined}
			onPointerDown={startMarquee}
		>
			{editable && centerGuide && (
				<div className="canvas-center-guide" aria-hidden="true" />
			)}
			{editable && marquee && (
				<div
					className="canvas-marquee"
					style={{
						left: `${marquee.x}%`,
						top: `${(marquee.y / height) * 100}%`,
						width: `${marquee.w}%`,
						height: `${(marquee.h / height) * 100}%`,
					}}
					aria-hidden="true"
				/>
			)}
			{editable && guide.kind === 'squares' && (
				<div
					className="canvas-grid-overlay"
					style={
						{
							'--gn': String(guide.n),
							// Cell height in % of the canvas height, precomputed so the CSS
							// stays a plain calc (cells are square in canvas-width units).
							'--gh': `${(10000 / (guide.n * height)).toFixed(4)}%`,
						} as CSSProperties
					}
					aria-hidden="true"
				/>
			)}
			{editable && guide.kind === 'columns' && (
				<div className="canvas-column-overlay" aria-hidden="true">
					{columnSpans(guide.n).map(({ x, w }, i) => (
						<span key={i} style={{ left: `${x}%`, width: `${w}%` }} />
					))}
				</div>
			)}
			{editable && dragId && (
				<div
					className={`canvas-drag-shield ${dragGesture ?? 'move'}`}
					aria-hidden="true"
				/>
			)}
			{renderItems.map((item) => {
				if (item.type === 'image') {
					const i = item.index;
					const img = images[i];
					const key = keyOf(img, i);
					const l = layouts[i];
					const vars = {
						...phoneVars(item.key), ...artworkEffectStyle(img), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar),
						zIndex:
							dragId === img.id || (dragId === '__group__' && selected.has(item.key))
								? DRAG_Z
								: imageZ(i),
					} as CSSProperties;
					const dragging =
						dragId === img.id || (dragId === '__group__' && selected.has(item.key));
					const href = editable ? undefined : imageClickHref(img);
					return (
						<div key={item.key} className={`canvas-item ${artworkEffectClass(img)} ${dragging ? 'dragging' : ''} ${selected.has(item.key) ? 'selected' : ''}`} style={vars}
							onPointerDown={editable ? (e) => startDrag(e, img, i, 'move') : undefined}
							role={!editable && !href && onOpen ? 'button' : undefined} tabIndex={!editable && !href && onOpen ? 0 : undefined}
							aria-haspopup={!editable && !href && onOpen ? 'dialog' : undefined}
							aria-label={!editable && !href && onOpen ? `Open ${img.title || img.alt || alt} in image viewer` : undefined}
							onClick={!editable && !href && onOpen ? (e) => onOpen(i, e.currentTarget) : undefined}
							onKeyDown={!editable && !href && onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(i, e.currentTarget); } } : undefined}>
							<img src={img.src} srcSet={img.srcSet} alt={img.decorative ? '' : img.alt || img.title || alt} loading="lazy" decoding="async" draggable={false}
								onError={img.sample ? (event) => showSampleUnavailable(event.currentTarget) : undefined}
								onLoad={editable ? (e) => measure(key, e.currentTarget) : undefined}
								ref={editable ? (el) => { if (el?.complete) measure(key, el); } : undefined} />
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
							{editable && !multiSelected && <span className="canvas-resize" onPointerDown={(e) => startDrag(e, img, i, 'resize')} aria-hidden="true" />}
						</div>
					);
				}
				if (item.type === 'embed') {
					const i = item.index;
					const embed = embeds[i];
					const l = embedLayouts[i];
					const vars = {
						...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar),
						zIndex:
							dragId === embed.id || (dragId === '__group__' && selected.has(item.key))
								? DRAG_Z
								: embedZ(i),
					} as CSSProperties;
					const spec = embedSpec(embed.url);
					const buyHref = spec ? null : stripePaymentLink(embed.url);
					const href = spec || buyHref ? null : safeHref(embed.url);
					const kind = spec?.kind ?? embedKindForInput(embed.url) ?? embed.kind ?? 'video';
					const label = spec?.provider ?? embedKindLabel(kind);
					return (
						<div
							key={item.key}
							className={`canvas-item canvas-embed-item canvas-embed-${kind} ${
								dragId === embed.id || (dragId === '__group__' && selected.has(item.key))
									? 'dragging'
									: ''
							} ${selected.has(item.key) ? 'selected' : ''}`}
							style={vars}
							onPointerDown={editable ? (e) => startEmbedDrag(e, embed, i, 'move') : undefined}
						>
							{spec ? (
								<iframe
									src={spec.src}
									title={spec.title}
									loading="lazy"
									allow={spec.allow}
									referrerPolicy="strict-origin-when-cross-origin"
									allowFullScreen={spec.allowFullScreen}
								/>
							) : buyHref ? (
								<div className="canvas-embed-fallback canvas-embed-buy">
									{editable ? (
										<span className="canvas-embed-buy-button">Buy</span>
									) : (
										<a
											className="canvas-embed-buy-button"
											href={buyHref}
											target="_blank"
											rel="noopener noreferrer"
											aria-label="Buy on Stripe"
										>
											Buy ↗
										</a>
									)}
								</div>
							) : (
								<div className="canvas-embed-fallback">
									{href && /^https?:/.test(href) && !editable ? (
										<a href={href} target="_blank" rel="noopener noreferrer">
											{kind === 'audio' ? 'Listen' : kind === 'map' ? 'Open map' : 'Watch video'} ↗
										</a>
									) : (
										<span>{embedKindLabel(kind)}</span>
									)}
								</div>
							)}
							{editable && (
								<button
									type="button"
									className="canvas-embed-drag-handle"
									aria-label={`Drag ${label}`}
									title={`Drag ${label}`}
									onPointerDown={(event) => startEmbedDrag(event, embed, i, 'move')}
								>
									<span aria-hidden="true">⠿</span> {label}
								</button>
							)}
							{editable && !multiSelected && <span className="canvas-resize" onPointerDown={(e) => startEmbedDrag(e, embed, i, 'resize')} aria-hidden="true" />}
						</div>
					);
				}
				if (item.type === 'widget') {
					const i = item.index;
					const widget = widgets[i];
					const l = widgetLayouts[i];
					const dragging = dragId === widget.id;
					const vars = {
						...phoneVars(item.key),
						'--x': String(l.x),
						'--y': String((l.y / height) * 100),
						'--w': String(l.w),
						'--ar': String(l.ar),
						zIndex: dragging ? DRAG_Z : widgetZ(i),
					} as CSSProperties;
					return (
						<div
							key={item.key}
							className={`canvas-item canvas-widget-item ${dragging ? 'dragging' : ''} ${selected.has(item.key) ? 'selected' : ''}`}
							style={vars}
							onPointerDown={editable ? (event) => startWidgetDrag(event, widget, i, 'move') : undefined}
							onClickCapture={
								editable
									? (event) => {
											if (draggedClickRef.current !== widget.id) return;
											event.preventDefault();
											event.stopPropagation();
											draggedClickRef.current = null;
										}
									: undefined
							}
						>
							<div className="canvas-widget-content">{widget.content}</div>
							{editable && (
								<span
									className="canvas-resize canvas-widget-resize"
									onPointerDown={(event) => startWidgetDrag(event, widget, i, 'resize')}
									title="Resize carousel"
									aria-hidden="true"
								/>
							)}
						</div>
					);
				}
				const i = item.index;
				const text = shownTexts[i];
				const l = textLayouts[i];
				const vars = {
					...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100), '--w': String(l.w),
					zIndex:
						dragId === text.id || (dragId === '__group__' && selected.has(item.key))
							? DRAG_Z
							: textZ(i),
				} as CSSProperties;
				return (
					<div key={item.key} className={`canvas-item canvas-text-item ${
						dragId === text.id || (dragId === '__group__' && selected.has(item.key))
							? 'dragging'
							: ''
					} ${selected.has(item.key) ? 'selected' : ''}`} style={vars}
						ref={(el) => { textEls.current[text.id] = el; }} onPointerDown={editable ? (e) => startTextDrag(e, text, i, 'move') : undefined}>
						<div className={`canvas-text align-${text.align ?? 'left'}`}>
							{text.text.trim() ? (
								<TextContent
									text={text.text}
									richText={text.richText}
									fontFamily={text.fontFamily}
									style={text.style}
									link={editable ? undefined : text.link}
									kinetic={text.kinetic}
									kineticTarget={text.kineticTarget}
								/>
							) : <em className="canvas-text-empty">Empty text — write in the panel</em>}
						</div>
						{editable && !multiSelected && <span className="canvas-resize" onPointerDown={(e) => startTextDrag(e, text, i, 'resize')} aria-hidden="true" />}
					</div>
				);
			})}
		</div>
	);
}
