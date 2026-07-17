// Freeform canvas — the modern replacement for the span grid. Each image sits
// at its stored {x, y, w} (percentages of the canvas width, y included, so the
// whole composition scales proportionally) with height fixed by its aspect
// ratio; text blocks pinned to the canvas render the same way with automatic
// height. On the published site it renders static; in the editor preview the
// same component turns interactive: drag to move, drag the corner handle to
// resize, with an optional grid overlay and snap-to-grid. Every change reports
// back through onLayoutChange / onTextLayout. Images without a stored layout
// yet are auto-flowed into rows (flowMissing) and, in the editor, committed
// once their real aspect ratio is measured.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CanvasText, ImageLayout, ResolvedImage, TextLayout } from './types';
import {
	canvasHeight,
	clampLayout,
	clampTextLayout,
	DEFAULT_AR,
	flowMissing,
	MIN_TEXT_W,
	MIN_W,
	roundLayout,
	roundTextLayout,
	snapTo,
	textBottom,
} from './canvasLayout';
import { TextLines } from './TextBlock';
import './Gallery.css';

/** Grid overlay density choices (vertical columns across the canvas); 0 = off. */
const GRID_OPTIONS = [0, 8, 12, 16] as const;

/** Editor preference, shared across galleries and sessions (never published). */
const GRID_PREFS_KEY = 'portfolio-editor.canvas-grid';

interface GridPrefs {
	cols: number;
	snap: boolean;
}

function loadGridPrefs(): GridPrefs {
	if (typeof window === 'undefined') return { cols: 0, snap: true };
	try {
		const parsed = JSON.parse(window.localStorage.getItem(GRID_PREFS_KEY) ?? '') as Partial<GridPrefs>;
		return {
			cols: (GRID_OPTIONS as readonly number[]).includes(parsed.cols ?? -1) ? (parsed.cols as number) : 0,
			snap: parsed.snap !== false,
		};
	} catch {
		return { cols: 0, snap: true };
	}
}

export interface CanvasGalleryProps {
	images: ResolvedImage[];
	/** Text blocks pinned to the canvas, rendered inside the composition. */
	texts?: CanvasText[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: enables move/resize instead of the lightbox. */
	editable?: boolean;
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize (and height re-measures) per pinned text. */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Published site: open the lightbox for image i. */
	onOpen?: (index: number) => void;
}

export default function CanvasGallery({
	images,
	texts = [],
	alt = 'Portfolio piece',
	editable = false,
	onLayoutChange,
	onTextLayout,
	onOpen,
}: CanvasGalleryProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	/** Live position of the image being dragged, keyed by id (committed on release). */
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
	const [gridPrefs, setGridPrefs] = useState<GridPrefs>(loadGridPrefs);

	useEffect(() => {
		if (!editable || typeof window === 'undefined') return;
		window.localStorage.setItem(GRID_PREFS_KEY, JSON.stringify(gridPrefs));
	}, [editable, gridPrefs]);

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
	const height = Math.max(canvasHeight(layouts), ...textLayouts.map(textBottom), 1);

	// Phones stack the canvas as one column — interleave images and texts by their
	// vertical position so the stacking follows the composition, not the DOM order.
	const stacked = [
		...images.map((img, i) => ({ key: `i${keyOf(img, i)}`, y: layouts[i].y })),
		...shownTexts.map((t, i) => ({ key: `t${t.id}`, y: textLayouts[i].y })),
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

	const startDrag = (e: React.PointerEvent, img: ResolvedImage, index: number, mode: 'move' | 'resize') => {
		if (!editable || !img.id || e.button !== 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const id = img.id;
		const scale = 100 / canvas.getBoundingClientRect().width; // px -> canvas-width %
		const from = layouts[index];
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
				// Snap the RIGHT edge to the grid so resized images line up with columns.
				const w = Math.min(from.w + Math.max(dx, dy * from.ar), 100 - from.x);
				next = { ...from, w: Math.max(snapTo(from.x + w, snapStep) - from.x, MIN_W) };
			}
			setDrafts((d) => ({ ...d, [id]: clampLayout(next) }));
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			setDragId(null);
			const done = draftsRef.current[id];
			if (done && onLayoutChange) onLayoutChange(id, roundLayout(done));
			setDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};

	const startTextDrag = (e: React.PointerEvent, text: CanvasText, index: number, mode: 'move' | 'resize') => {
		if (!editable || e.button !== 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const id = text.id;
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
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			setDragId(null);
			const done = textDraftsRef.current[id];
			if (done && onTextLayout) onTextLayout(id, roundTextLayout(done));
			setTextDrafts((d) => {
				const rest = { ...d };
				delete rest[id];
				return rest;
			});
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};

	const canvas = (
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

	if (!editable) return canvas;

	return (
		<div className="canvas-editor">
			<div className="canvas-toolbar">
				<span className="canvas-toolbar-label">Grid</span>
				{GRID_OPTIONS.map((n) => (
					<button
						key={n}
						type="button"
						className={`canvas-tool ${gridPrefs.cols === n ? 'active' : ''}`}
						onClick={() => setGridPrefs((p) => ({ ...p, cols: n }))}
						title={n === 0 ? 'Hide the grid overlay' : `Overlay a ${n}-column grid`}
					>
						{n === 0 ? 'Off' : String(n)}
					</button>
				))}
				<label className={`canvas-snap ${gridPrefs.cols === 0 ? 'disabled' : ''}`}>
					<input
						type="checkbox"
						checked={gridPrefs.snap && gridPrefs.cols > 0}
						disabled={gridPrefs.cols === 0}
						onChange={(e) => setGridPrefs((p) => ({ ...p, snap: e.target.checked }))}
					/>
					Snap to grid
				</label>
			</div>
			{canvas}
		</div>
	);
}
