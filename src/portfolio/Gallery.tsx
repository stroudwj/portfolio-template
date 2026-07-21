import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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
	const isOpen = openIndex !== null;
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const dialogTitleId = useId();
	const dialogCaptionId = useId();
	// The <body> this gallery actually renders in (the editor preview can run
	// inside an iframe). The lightbox portals there so no transformed/scrollable
	// ancestor (like the editor's preview pane) can trap or scroll past it.
	const [host, setHost] = useState<HTMLElement | null>(null);
	const [isPhone, setIsPhone] = useState(false);
	const setGalleryRoot = useCallback((el: HTMLDivElement | null) => {
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
				return isPhone && hidden ? [] : [i];
			}),
		[isPhone, renderedImages, settings?.mobile?.items],
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
					‹
				</button>
			)}
			<figure className="modal-figure">
				<img src={open.full ?? open.src} alt={open.alt || open.title || 'Full resolution portfolio piece'} />
				{(open.title || open.description || open.link) && (
					<figcaption id={dialogCaptionId} className="modal-caption">
						{open.title && <span className="modal-caption-title">{open.title}</span>}
						{open.description && <span className="modal-caption-description">{open.description}</span>}
						{open.link && (
							<a className="modal-caption-link" href={safeHref(open.link)} target="_blank" rel="noopener">
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
					›
				</button>
			)}
		</div>
	) : null;

	return (
		<div ref={setGalleryRoot} className="gallery-root" data-phone-ready={isPhone ? 'true' : undefined}>
			{uniformMode ? (
				<div
					className={`uniform-grid ${cellAr ? 'cropped' : ''}`}
					style={{
						'--cols': String(cols),
						'--cell-ar': cellAr ? String(cellAr) : undefined,
						'--mobile-cols': String(settings?.mobile?.columns ?? 1),
					} as CSSProperties}
				>
					{renderedImages.map(({ img, i }) => (
						<div
							className="uniform-item"
							style={phoneItemVars(settings, imagePhoneKey(img, i), i)}
							key={img.id ?? `${img.src}-${i}`}
						>
							<img
								src={img.src}
								srcSet={img.srcSet}
								alt={img.alt || img.title || alt}
								className={editable ? undefined : 'lightbox-trigger'}
								loading="lazy"
								decoding="async"
								role={editable ? undefined : 'button'}
								tabIndex={editable ? undefined : 0}
								aria-haspopup={editable ? undefined : 'dialog'}
								aria-label={editable ? undefined : `Open ${img.title || img.alt || alt} in image viewer`}
								onClick={editable ? undefined : (e) => openLightbox(i, e.currentTarget)}
								onKeyDown={editable ? undefined : (e) => openFromKeyboard(e, i)}
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
					mobile={settings?.mobile}
					phoneActive={isPhone}
					editable={editable}
					onLayoutChange={onLayoutChange}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onOpen={editable ? undefined : openLightbox}
				/>
			) : (
				<div className="masonry-grid">
					{renderedImages.map(({ img, i }) => (
						<div
							className="masonry-item"
							style={{ ...spanVars(img), ...phoneItemVars(settings, imagePhoneKey(img, i), i) }}
							key={img.id ?? `${img.src}-${i}`}
						>
							<img
								src={img.src}
								srcSet={img.srcSet}
								alt={img.alt || img.title || alt}
								className="lightbox-trigger"
								loading="lazy"
								decoding="async"
								role="button"
								tabIndex={0}
								aria-haspopup="dialog"
								aria-label={`Open ${img.title || img.alt || alt} in image viewer`}
								onClick={(e) => openLightbox(i, e.currentTarget)}
								onKeyDown={(e) => openFromKeyboard(e, i)}
							/>
						</div>
					))}
				</div>
			)}

			{host ? createPortal(modal, host) : null}
		</div>
	);
}
