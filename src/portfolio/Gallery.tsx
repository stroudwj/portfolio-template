import { useEffect, useState, type CSSProperties } from 'react';
import type { ImageLayout, ResolvedImage } from './types';
import { safeHref } from './safeHref';
import CanvasGallery from './CanvasGallery';
import './Gallery.css';

export const GRID_MAX_SPAN = 4;

const clampSpan = (value: number | undefined): number =>
	Math.min(Math.max(Math.round(value ?? 1), 1), GRID_MAX_SPAN);

/** Per-image grid placement as CSS variables Gallery.css turns into spans. */
const spanVars = (img: ResolvedImage): CSSProperties =>
	({ '--w': String(clampSpan(img.w)), '--h': String(clampSpan(img.h)) }) as CSSProperties;

export interface GalleryProps {
	images: ResolvedImage[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: images become movable/resizable instead of zoomable. */
	editable?: boolean;
	/** Reports a finished move/resize per image (editor only). */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
}

/**
 * A page's images + click-to-zoom lightbox. Renders the freeform canvas
 * (CanvasGallery) whenever any image carries a layout — always in the editor —
 * and falls back to the legacy span grid for never-rearranged content.
 */
export default function Gallery({ images, alt = 'Portfolio piece', editable = false, onLayoutChange }: GalleryProps) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const open = openIndex !== null ? images[openIndex] : null;

	useEffect(() => {
		if (openIndex === null) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpenIndex(null);
		};
		document.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
		};
	}, [openIndex]);

	if (images.length === 0) {
		return (
			<div className="gallery-empty">
				<p>This page is empty… add some images, text, or videos.</p>
			</div>
		);
	}

	const canvasMode = editable || images.some((img) => img.layout);

	return (
		<>
			{canvasMode ? (
				<CanvasGallery
					images={images}
					alt={alt}
					editable={editable}
					onLayoutChange={onLayoutChange}
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
				{open && <img src={open.src} srcSet={open.srcSet} alt={open.title || 'Full resolution portfolio piece'} />}
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
		</>
	);
}
