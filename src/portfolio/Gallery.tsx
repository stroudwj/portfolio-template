import { useEffect, useState } from 'react';
import type { ResolvedImage } from './types';
import './Gallery.css';

export interface GalleryProps {
	images: ResolvedImage[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
}

/** Responsive image grid + click-to-zoom lightbox (ported from Gallery.astro). */
export default function Gallery({ images, alt = 'Portfolio piece' }: GalleryProps) {
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
				<p>
					No images yet. Add photos to this page's folder in <code>src/assets/</code> and they'll appear here
					automatically.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="masonry-grid">
				{images.map((img, i) => (
					<div className="masonry-item" key={img.id ?? `${img.src}-${i}`}>
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
							<a className="modal-caption-link" href={open.link} target="_blank" rel="noopener">
								View project ↗
							</a>
						)}
					</figcaption>
				)}
			</div>
		</>
	);
}
