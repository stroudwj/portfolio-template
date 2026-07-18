import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasEmbed, CanvasText, GalleryConfig, ImageLayout, ResolvedImage, TextLayout } from './types';
import { safeHref } from './safeHref';
import CanvasGallery from './CanvasGallery';
import './Gallery.css';

export const GRID_MAX_SPAN = 4;

const clampSpan = (value: number | undefined): number =>
	Math.min(Math.max(Math.round(value ?? 1), 1), GRID_MAX_SPAN);

/** Per-image grid placement as CSS variables Gallery.css turns into spans. */
const spanVars = (img: ResolvedImage): CSSProperties =>
	({ '--w': String(clampSpan(img.w)), '--h': String(clampSpan(img.h)) }) as CSSProperties;

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
	/** Editor preview: images become movable/resizable instead of zoomable. */
	editable?: boolean;
	/** Reports a finished move/resize per image (editor only). */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize per pinned text (editor only). */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned video embed (editor only). */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
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
	editable = false,
	onLayoutChange,
	onTextLayout,
	onEmbedLayout,
}: GalleryProps) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const open = openIndex !== null ? images[openIndex] : null;
	// The <body> this gallery actually renders in (the editor preview can run
	// inside an iframe). The lightbox portals there so no transformed/scrollable
	// ancestor (like the editor's preview pane) can trap or scroll past it.
	const [host, setHost] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (openIndex === null || !host) return;
		const doc = host.ownerDocument;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpenIndex(null);
		};
		doc.addEventListener('keydown', onKey);
		const previousOverflow = host.style.overflow;
		host.style.overflow = 'hidden';
		return () => {
			doc.removeEventListener('keydown', onKey);
			host.style.overflow = previousOverflow;
		};
	}, [openIndex, host]);

	if (images.length === 0 && !texts?.length && !embeds?.length) {
		return (
			<div className="gallery-empty">
				<p>This page is empty… add some images, text, or videos.</p>
			</div>
		);
	}

	const uniformMode = settings?.layout === 'grid';
	const canvasMode =
		!uniformMode && (editable || images.some((img) => img.layout) || !!texts?.length || !!embeds?.length);
	const cols = uniformColumns(settings?.columns);
	const cellAr = parseAspect(settings?.aspect);

	const modal = (
		<div
			className={`modal ${open ? 'show' : ''}`}
			role="dialog"
			aria-hidden={open ? 'false' : 'true'}
			onClick={(e) => {
				if (e.target === e.currentTarget) setOpenIndex(null);
			}}
		>
			<span className="close-btn" onClick={() => setOpenIndex(null)}>
				&times;
			</span>
			{open && <img src={open.full ?? open.src} alt={open.title || 'Full resolution portfolio piece'} />}
			{open && (open.title || open.description || open.link) && (
				<figcaption className="modal-caption">
					{open.title && <span className="modal-caption-title">{open.title}</span>}
					{open.description && <span className="modal-caption-description">{open.description}</span>}
					{open.link && (
						<a className="modal-caption-link" href={safeHref(open.link)} target="_blank" rel="noopener">
							View project ↗
						</a>
					)}
				</figcaption>
			)}
		</div>
	);

	return (
		<div
			ref={(el) => {
				setHost(el ? el.ownerDocument.body : null);
			}}
		>
			{uniformMode ? (
				<div
					className={`uniform-grid ${cellAr ? 'cropped' : ''}`}
					style={{ '--cols': String(cols), '--cell-ar': cellAr ? String(cellAr) : undefined } as CSSProperties}
				>
					{images.map((img, i) => (
						<div className="uniform-item" key={img.id ?? `${img.src}-${i}`}>
							<img
								src={img.src}
								srcSet={img.srcSet}
								alt={img.title || alt}
								className={editable ? undefined : 'lightbox-trigger'}
								loading="lazy"
								decoding="async"
								onClick={editable ? undefined : () => setOpenIndex(i)}
							/>
						</div>
					))}
				</div>
			) : canvasMode ? (
				<CanvasGallery
					images={images}
					texts={texts}
					embeds={embeds}
					alt={alt}
					editable={editable}
					onLayoutChange={onLayoutChange}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onOpen={editable ? undefined : setOpenIndex}
				/>
			) : (
				<div className="masonry-grid">
					{images.map((img, i) => (
						<div className="masonry-item" style={spanVars(img)} key={img.id ?? `${img.src}-${i}`}>
							<img
								src={img.src}
								srcSet={img.srcSet}
								alt={img.title || alt}
								className="lightbox-trigger"
								loading="lazy"
								decoding="async"
								onClick={() => setOpenIndex(i)}
							/>
						</div>
					))}
				</div>
			)}

			{host ? createPortal(modal, host) : null}
		</div>
	);
}
