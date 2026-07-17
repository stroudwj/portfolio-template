// Freeform image canvas — the modern replacement for the span grid. Each image
// sits at its stored {x, y, w} (percentages of the canvas width, y included, so
// the whole composition scales proportionally) with height fixed by its aspect
// ratio. On the published site it renders static; in the editor preview the
// same component turns interactive: drag an image to move it, drag the corner
// handle to resize, and every change reports back through onLayoutChange.
// Images without a stored layout yet are auto-flowed into rows (flowMissing)
// and, in the editor, committed once their real aspect ratio is measured.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ImageLayout, ResolvedImage } from './types';
import { canvasHeight, clampLayout, DEFAULT_AR, flowMissing, roundLayout } from './canvasLayout';
import './Gallery.css';

export interface CanvasGalleryProps {
	images: ResolvedImage[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: enables move/resize instead of the lightbox. */
	editable?: boolean;
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Published site: open the lightbox for image i. */
	onOpen?: (index: number) => void;
}

export default function CanvasGallery({
	images,
	alt = 'Portfolio piece',
	editable = false,
	onLayoutChange,
	onOpen,
}: CanvasGalleryProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	/** Live position of the image being dragged, keyed by id (committed on release). */
	const [drafts, setDrafts] = useState<Record<string, ImageLayout>>({});
	const draftsRef = useRef(drafts);
	draftsRef.current = drafts;
	/** Aspect ratios measured from the loaded pixels (editor only). */
	const [measured, setMeasured] = useState<Record<string, number>>({});
	const [dragId, setDragId] = useState<string | null>(null);

	const keyOf = (img: ResolvedImage, i: number): string => img.id ?? `${img.src}-${i}`;

	// Effective layout per image: in-flight draft > stored > auto-flowed default.
	const flowed = flowMissing(
		images.map((img, i) => ({ layout: img.layout, ar: measured[keyOf(img, i)] ?? img.ar })),
	);
	const layouts = images.map(
		(img, i) => drafts[keyOf(img, i)] ?? img.layout ?? flowed.get(i) ?? { x: 0, y: 0, w: 30, ar: DEFAULT_AR },
	);
	const height = Math.max(canvasHeight(layouts), 1);

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
			const next =
				mode === 'move'
					? { ...from, x: from.x + dx, y: from.y + dy }
					: { ...from, w: Math.min(from.w + Math.max(dx, dy * from.ar), 100 - from.x) };
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

	return (
		<div
			ref={canvasRef}
			className={`canvas-gallery ${editable ? 'editable' : ''}`}
			style={{ '--ch': String(height) } as CSSProperties}
		>
			{images.map((img, i) => {
				const key = keyOf(img, i);
				const l = layouts[i];
				const vars = {
					'--x': String(l.x),
					'--y': String((l.y / height) * 100),
					'--w': String(l.w),
					'--ar': String(l.ar),
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
		</div>
	);
}
