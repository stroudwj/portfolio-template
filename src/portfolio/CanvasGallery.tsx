// Freeform canvas — the modern replacement for the span grid. Each image sits
// at its stored {x, y, w} (percentages of the canvas width, y included, so the
// whole composition scales proportionally) with height fixed by its aspect
// ratio; text blocks and video embeds pinned to the canvas render the same way
// (texts with automatic height, videos at 16:9). On the published site it
// renders static; in the editor preview the same component turns interactive:
// drag to move, drag the corner handle to resize, with an optional grid overlay
// and snap-to-grid (both controlled from the editor panel via gridPrefs).
// Every change reports back through onLayoutChange / onTextLayout /
// onEmbedLayout. Images without a stored layout yet are auto-flowed into rows
// (flowMissing) and, in the editor, committed once their real aspect ratio is
// measured.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CanvasEmbed, CanvasText, ImageLayout, ResolvedImage, TextLayout } from './types';
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
	roundLayout,
	roundTextLayout,
	snapSpanToEdges,
	snapTo,
	snapToEdges,
	textBottom,
} from './canvasLayout';
import { guideById, useGridPrefs } from './gridPrefs';
import { videoEmbedSrc } from './videoEmbed';
import { stripePaymentLink } from './paymentEmbed';
import { safeHref } from './safeHref';
import { TextContent } from './TextBlock';
import { automaticPhoneOrder } from './mobileOrder';
import './Gallery.css';

export interface CanvasGalleryProps {
	images: ResolvedImage[];
	/** Text blocks pinned to the canvas, rendered inside the composition. */
	texts?: CanvasText[];
	/** Video embeds pinned to the canvas, rendered inside the composition. */
	embeds?: CanvasEmbed[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: enables move/resize instead of the lightbox. */
	editable?: boolean;
	/** Optional phone-only order, size and visibility. Absent = automatic. */
	mobile?: MobileComposition;
	/** True when this hydrated gallery is currently inside the phone breakpoint. */
	phoneActive?: boolean;
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize (and height re-measures) per pinned text. */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned video embed. */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
	/** Published site: open the lightbox for image i and restore focus to its trigger afterwards. */
	onOpen?: (index: number, trigger?: HTMLElement) => void;
}

export default function CanvasGallery({
	images,
	texts = [],
	embeds = [],
	alt = 'Portfolio piece',
	editable = false,
	mobile,
	phoneActive = false,
	onLayoutChange,
	onTextLayout,
	onEmbedLayout,
	onOpen,
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
	/** Aspect ratios measured from the loaded pixels (editor only). */
	const [measured, setMeasured] = useState<Record<string, number>>({});
	const [dragId, setDragId] = useState<string | null>(null);
	const textEls = useRef<Record<string, HTMLDivElement | null>>({});
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
	const neighborEdges = (excludeId: string): { xs: number[]; ys: number[] } => {
		if (!edgeSnapOn) return { xs: [], ys: [] };
		const xs: number[] = [];
		const ys: number[] = [];
		images.forEach((img, i) => {
			if ((img.id ?? keyOf(img, i)) === excludeId) return;
			const l = layouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		embeds.forEach((v, i) => {
			if (v.id === excludeId) return;
			const l = embedLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		shownTexts.forEach((t, i) => {
			if (t.id === excludeId) return;
			const l = textLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, textBottom(l));
		});
		return { xs, ys };
	};

	const keyOf = (img: ResolvedImage, i: number): string => img.id ?? `${img.src}-${i}`;

	// Empty pinned texts stay draggable in the editor; on the site they render nothing.
	const shownTexts = editable ? texts : texts.filter((t) => t.text.trim());

	// Effective layout per item: in-flight draft > stored > auto-flowed default.
	const flowed = flowMissing(
		images.map((img, i) => ({ layout: img.layout, ar: measured[keyOf(img, i)] ?? img.ar })),
	);
	const layouts = images.map(
		(img, i) => drafts[keyOf(img, i)] ?? img.layout ?? flowed.get(i) ?? { x: 0, y: 0, w: 30, ar: DEFAULT_AR },
	);
	const textLayouts = shownTexts.map((t) => textDrafts[t.id] ?? t.layout);
	const embedLayouts = embeds.map((v) => drafts[v.id] ?? v.layout);
	const height = Math.max(
		canvasHeight(layouts),
		...textLayouts.map(textBottom),
		...embedLayouts.map(bottomOf),
		1,
	);

	// Phones stack the canvas as one column — interleave images, texts and videos
	// by their vertical position so the stacking follows the composition, not the
	// DOM order.
	const automaticKeys = automaticPhoneOrder([
		...images.map((img, i) => ({ key: `image:${keyOf(img, i)}`, y: layouts[i].y, kind: 'image' as const, index: i })),
		...shownTexts.map((t, i) => ({ key: `text:${t.id}`, y: textLayouts[i].y, kind: 'text' as const, index: i })),
		...embeds.map((v, i) => ({ key: `video:${v.id}`, y: embedLayouts[i].y, kind: 'video' as const, index: i })),
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
			const h = (el.offsetHeight * 100) / width;
			if (Math.abs((t.layout.h ?? 0) - h) > 0.5) onTextLayout(t.id, roundTextLayout({ ...t.layout, h }));
		}
	});

	/** Shared move/resize wiring for images and embeds (both use ImageLayout). */
	const startItemDrag = (
		e: React.PointerEvent,
		id: string,
		from: ImageLayout,
		mode: 'move' | 'resize',
		minW: number,
		commit: (id: string, layout: ImageLayout) => void,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		// Inside the phone-preview iframe the drag must listen on THAT window.
		const win = canvas.ownerDocument.defaultView ?? window;
		const scale = 100 / canvas.getBoundingClientRect().width; // px -> canvas-width %
		const startX = e.clientX;
		const startY = e.clientY;
		const { xs, ys } = neighborEdges(id);
		setDragId(id);
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - startX) * scale;
			const dy = (ev.clientY - startY) * scale;
			const h = from.w / from.ar;
			let next: ImageLayout;
			if (mode === 'move') {
				// Guide snap first, then let a nearby neighbor edge take over so the
				// item's top/bottom (or sides) lines up exactly with its neighbors'.
				const x = snapSpanToEdges(snapX(from.x + dx), from.w, xs);
				const y = snapSpanToEdges(snapY(from.y + dy), h, ys);
				next = { ...from, x, y };
			} else {
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
			setDrafts((d) => ({ ...d, [id]: clampLayout(next) }));
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			setDragId(null);
			const done = draftsRef.current[id];
			if (done) commit(id, roundLayout(done));
			setDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
	};

	const startDrag = (e: React.PointerEvent, img: ResolvedImage, index: number, mode: 'move' | 'resize') => {
		if (!editable || !img.id || e.button !== 0 || !onLayoutChange) return;
		startItemDrag(e, img.id, layouts[index], mode, MIN_W, onLayoutChange);
	};

	const startEmbedDrag = (e: React.PointerEvent, embed: CanvasEmbed, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0 || !onEmbedLayout) return;
		startItemDrag(e, embed.id, embedLayouts[index], mode, MIN_EMBED_W, onEmbedLayout);
	};

	const startTextDrag = (e: React.PointerEvent, text: CanvasText, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const id = text.id;
		const win = canvas.ownerDocument.defaultView ?? window;
		const scale = 100 / canvas.getBoundingClientRect().width;
		const from = textLayouts[index];
		const startX = e.clientX;
		const startY = e.clientY;
		const { xs, ys } = neighborEdges(id);
		const fromH = textBottom(from) - from.y;
		setDragId(id);
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - startX) * scale;
			const dy = (ev.clientY - startY) * scale;
			const next =
				mode === 'move'
					? {
							...from,
							x: snapSpanToEdges(snapX(from.x + dx), from.w, xs),
							y: snapSpanToEdges(snapY(from.y + dy), fromH, ys),
						}
					: { ...from, w: Math.max(snapX(from.x + from.w + dx) - from.x, MIN_TEXT_W) };
			setTextDrafts((d) => ({ ...d, [id]: clampTextLayout(next) }));
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			setDragId(null);
			const done = textDraftsRef.current[id];
			if (done && onTextLayout) onTextLayout(id, roundTextLayout(done));
			setTextDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
	};

	return (
		<div
			ref={canvasRef}
			className={`canvas-gallery ${editable ? 'editable' : ''}`}
			style={{ '--ch': String(height) } as CSSProperties}
		>
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
			{renderItems.map((item) => {
				if (item.type === 'image') {
					const i = item.index;
					const img = images[i];
					const key = keyOf(img, i);
					const l = layouts[i];
					const vars = {
						...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar), zIndex: dragId === img.id ? DRAG_Z : imageZ(i),
					} as CSSProperties;
					return (
						<div key={item.key} className={`canvas-item ${dragId === img.id ? 'dragging' : ''}`} style={vars}
							onPointerDown={editable ? (e) => startDrag(e, img, i, 'move') : undefined}
							role={!editable && onOpen ? 'button' : undefined} tabIndex={!editable && onOpen ? 0 : undefined}
							aria-haspopup={!editable && onOpen ? 'dialog' : undefined}
							aria-label={!editable && onOpen ? `Open ${img.title || img.alt || alt} in image viewer` : undefined}
							onClick={!editable && onOpen ? (e) => onOpen(i, e.currentTarget) : undefined}
							onKeyDown={!editable && onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(i, e.currentTarget); } } : undefined}>
							<img src={img.src} srcSet={img.srcSet} alt={img.alt || img.title || alt} loading="lazy" decoding="async" draggable={false}
								onLoad={editable ? (e) => measure(key, e.currentTarget) : undefined}
								ref={editable ? (el) => { if (el?.complete) measure(key, el); } : undefined} />
							{editable && <span className="canvas-resize" onPointerDown={(e) => startDrag(e, img, i, 'resize')} aria-hidden="true" />}
						</div>
					);
				}
				if (item.type === 'embed') {
					const i = item.index;
					const embed = embeds[i];
					const l = embedLayouts[i];
					const vars = {
						...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar), zIndex: dragId === embed.id ? DRAG_Z : embedZ(i),
					} as CSSProperties;
					const src = videoEmbedSrc(embed.url);
					const buyHref = src ? null : stripePaymentLink(embed.url);
					const href = src || buyHref ? null : safeHref(embed.url);
					return (
						<div
							key={item.key}
							className={`canvas-item canvas-embed-item ${dragId === embed.id ? 'dragging' : ''}`}
							style={vars}
							onPointerDown={editable ? (e) => startEmbedDrag(e, embed, i, 'move') : undefined}
						>
							{src ? (
								<iframe
									src={src}
									title="Embedded video"
									loading="lazy"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowFullScreen
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
											Watch video ↗
										</a>
									) : (
										<span>Video</span>
									)}
								</div>
							)}
							{editable && <span className="canvas-embed-shield" aria-hidden="true" />}
							{editable && <span className="canvas-resize" onPointerDown={(e) => startEmbedDrag(e, embed, i, 'resize')} aria-hidden="true" />}
						</div>
					);
				}
				const i = item.index;
				const text = shownTexts[i];
				const l = textLayouts[i];
				const vars = {
					...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100), '--w': String(l.w),
					zIndex: dragId === text.id ? DRAG_Z : textZ(i),
				} as CSSProperties;
				return (
					<div key={item.key} className={`canvas-item canvas-text-item ${dragId === text.id ? 'dragging' : ''}`} style={vars}
						ref={(el) => { textEls.current[text.id] = el; }} onPointerDown={editable ? (e) => startTextDrag(e, text, i, 'move') : undefined}>
						<div className={`canvas-text align-${text.align ?? 'left'}`}>
							{text.text.trim() ? <TextContent text={text.text} style={text.style} link={editable ? undefined : text.link} /> : <em className="canvas-text-empty">Empty text — write in the panel</em>}
						</div>
						{editable && <span className="canvas-resize" onPointerDown={(e) => startTextDrag(e, text, i, 'resize')} aria-hidden="true" />}
					</div>
				);
			})}
		</div>
	);
}
