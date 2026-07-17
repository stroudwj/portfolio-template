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
import {
	bottomOf,
	canvasHeight,
	clampLayout,
	clampTextLayout,
	DEFAULT_AR,
	flowMissing,
	MIN_EMBED_W,
	MIN_TEXT_W,
	MIN_W,
	roundLayout,
	roundTextLayout,
	snapTo,
	textBottom,
} from './canvasLayout';
import { useGridPrefs } from './gridPrefs';
import { videoEmbedSrc } from './videoEmbed';
import { safeHref } from './safeHref';
import { TextLines } from './TextBlock';
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
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize (and height re-measures) per pinned text. */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned video embed. */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
	/** Published site: open the lightbox for image i. */
	onOpen?: (index: number) => void;
}

export default function CanvasGallery({
	images,
	texts = [],
	embeds = [],
	alt = 'Portfolio piece',
	editable = false,
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

	/** Snap increment in canvas-width % (0 = snapping off). */
	const snapStep = editable && gridPrefs.cols > 0 && gridPrefs.snap ? 100 / gridPrefs.cols : 0;

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
	const stacked = [
		...images.map((img, i) => ({ key: `i${keyOf(img, i)}`, y: layouts[i].y })),
		...shownTexts.map((t, i) => ({ key: `t${t.id}`, y: textLayouts[i].y })),
		...embeds.map((v, i) => ({ key: `v${v.id}`, y: embedLayouts[i].y })),
	];
	const orderOf = new Map(stacked.sort((a, b) => a.y - b.y).map((e, rank) => [e.key, rank]));

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
		setDragId(id);
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - startX) * scale;
			const dy = (ev.clientY - startY) * scale;
			let next: ImageLayout;
			if (mode === 'move') {
				next = { ...from, x: snapTo(from.x + dx, snapStep), y: snapTo(from.y + dy, snapStep) };
			} else {
				// Snap the RIGHT edge to the grid so resized items line up with columns.
				const w = Math.min(from.w + Math.max(dx, dy * from.ar), 100 - from.x);
				next = { ...from, w: Math.max(snapTo(from.x + w, snapStep) - from.x, minW) };
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
		setDragId(id);
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - startX) * scale;
			const dy = (ev.clientY - startY) * scale;
			const next =
				mode === 'move'
					? { ...from, x: snapTo(from.x + dx, snapStep), y: snapTo(from.y + dy, snapStep) }
					: { ...from, w: Math.max(snapTo(from.x + from.w + dx, snapStep) - from.x, MIN_TEXT_W) };
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
			{editable && gridPrefs.cols > 0 && (
				<div
					className="canvas-grid-overlay"
					style={
						{
							'--gn': String(gridPrefs.cols),
							// Cell height in % of the canvas height, precomputed so the CSS
							// stays a plain calc (cells are square in canvas-width units).
							'--gh': `${(10000 / (gridPrefs.cols * height)).toFixed(4)}%`,
						} as CSSProperties
					}
					aria-hidden="true"
				/>
			)}
			{images.map((img, i) => {
				const key = keyOf(img, i);
				const l = layouts[i];
				const vars = {
					'--x': String(l.x),
					'--y': String((l.y / height) * 100),
					'--w': String(l.w),
					'--ar': String(l.ar),
					order: orderOf.get(`i${key}`),
				} as CSSProperties;
				return (
					<div
						key={key}
						className={`canvas-item ${dragId === img.id ? 'dragging' : ''}`}
						style={vars}
						onPointerDown={editable ? (e) => startDrag(e, img, i, 'move') : undefined}
						onClick={!editable && onOpen ? () => onOpen(i) : undefined}
					>
						<img
							src={img.src}
							srcSet={img.srcSet}
							alt={img.title || alt}
							loading="lazy"
							decoding="async"
							draggable={false}
							onLoad={editable ? (e) => measure(key, e.currentTarget) : undefined}
							ref={editable ? (el) => { if (el?.complete) measure(key, el); } : undefined}
						/>
						{editable && (
							<span
								className="canvas-resize"
								onPointerDown={(e) => startDrag(e, img, i, 'resize')}
								aria-hidden="true"
							/>
						)}
					</div>
				);
			})}
			{embeds.map((embed, i) => {
				const l = embedLayouts[i];
				const vars = {
					'--x': String(l.x),
					'--y': String((l.y / height) * 100),
					'--w': String(l.w),
					'--ar': String(l.ar),
					order: orderOf.get(`v${embed.id}`),
				} as CSSProperties;
				const src = videoEmbedSrc(embed.url);
				const href = src ? null : safeHref(embed.url);
				return (
					<div
						key={embed.id}
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
						) : (
							<div className="canvas-embed-fallback">
								{href && /^https?:/.test(href) && !editable ? (
									<a href={href} target="_blank" rel="noopener">
										Watch video ↗
									</a>
								) : (
									<span>Video</span>
								)}
							</div>
						)}
						{/* The iframe swallows pointer events; this shield keeps the video
						    draggable in the editor (the published site renders it playable). */}
						{editable && <span className="canvas-embed-shield" aria-hidden="true" />}
						{editable && (
							<span
								className="canvas-resize"
								onPointerDown={(e) => startEmbedDrag(e, embed, i, 'resize')}
								aria-hidden="true"
							/>
						)}
					</div>
				);
			})}
			{shownTexts.map((t, i) => {
				const l = textLayouts[i];
				const vars = {
					'--x': String(l.x),
					'--y': String((l.y / height) * 100),
					'--w': String(l.w),
					order: orderOf.get(`t${t.id}`),
				} as CSSProperties;
				return (
					<div
						key={t.id}
						className={`canvas-item canvas-text-item ${dragId === t.id ? 'dragging' : ''}`}
						style={vars}
						ref={(el) => {
							textEls.current[t.id] = el;
						}}
						onPointerDown={editable ? (e) => startTextDrag(e, t, i, 'move') : undefined}
					>
						<div className={`canvas-text align-${t.align ?? 'left'}`}>
							{t.text.trim() ? <TextLines text={t.text} /> : <em className="canvas-text-empty">Empty text — write in the panel</em>}
						</div>
						{editable && (
							<span
								className="canvas-resize"
								onPointerDown={(e) => startTextDrag(e, t, i, 'resize')}
								aria-hidden="true"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
