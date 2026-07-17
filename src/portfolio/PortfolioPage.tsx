import { useRef, useState } from 'react';
import Hero from './Hero';
import Gallery from './Gallery';
import About from './About';
import TextBlock from './TextBlock';
import Embed from './Embed';
import ChildPages from './ChildPages';
import { withBase, type CanvasText, type PortfolioData, type TextLayout } from './types';
import { clampTextLayout, MIN_TEXT_W, roundTextLayout } from './canvasLayout';
import type { ImageLayout, PageBlock } from '../lib/content';

export interface PortfolioPageProps extends PortfolioData {
	/** Page key: 'home', a nav path like 'art', or a nested path like 'work/project-a'. */
	page: string;
	base: string;
	/** Editor preview: switch pages in place instead of following real links. */
	onNavigate?: (path: string) => void;
	/** Editor preview: makes gallery images movable/resizable and reports changes. */
	onImageLayout?: (folder: string, imageId: string, layout: ImageLayout) => void;
	/** Editor preview: reports a text block placed/moved on the page canvas. */
	onTextLayout?: (page: string, blockId: string, layout: TextLayout) => void;
}

/**
 * Editor-only wrapper that lets a flow text block be dragged onto the page's
 * freeform canvas: it follows the pointer, and dropping it inside the canvas
 * reports an equivalent canvas placement (same spot the text was released).
 */
function DraggableFlowText({ children, onPlace }: { children: React.ReactNode; onPlace: (layout: TextLayout) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);

	const start = (e: React.PointerEvent) => {
		if (e.button !== 0) return;
		const el = ref.current;
		if (!el) return;
		// The page's canvas, if it has one (editor preview always sits in .portfolio-root).
		const canvas = (el.closest('.portfolio-root') ?? document).querySelector('.canvas-gallery');
		if (!canvas) return;
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		let moved = false;
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
			setDelta({ x: dx, y: dy });
		};
		const up = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			setDelta(null);
			if (!moved) return;
			const rect = canvas.getBoundingClientRect();
			if (!rect.width) return;
			// Only pin when the pointer lets go inside the canvas; otherwise snap back.
			if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom)
				return;
			// The paragraph is the visible text box (the wrapper spans full width).
			const box = (el.querySelector('p') ?? el).getBoundingClientRect();
			const scale = 100 / rect.width; // px -> canvas-width %
			onPlace(
				roundTextLayout(
					clampTextLayout({
						x: (box.left - rect.left) * scale,
						y: (box.top - rect.top) * scale,
						w: Math.min(Math.max(box.width * scale, MIN_TEXT_W), 100),
						h: box.height * scale,
					}),
				),
			);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};

	return (
		<div
			ref={ref}
			className={`flow-text-draggable ${delta ? 'dragging' : ''}`}
			style={delta ? { transform: `translate(${delta.x}px, ${delta.y}px)` } : undefined}
			onPointerDown={start}
		>
			{children}
		</div>
	);
}

/**
 * Renders one page's body from resolved data as its ordered blocks (text, gallery,
 * sub-page cards, about). Shared by the Astro site (per-page) and the editor preview,
 * so the page composition lives in exactly one place. Content is always migrated
 * (migrateContent) before it gets here, so `blocks` is present.
 */
export default function PortfolioPage({ page, content, galleries, profileImageSrc, pageThumbs, base, onNavigate, onImageLayout, onTextLayout }: PortfolioPageProps) {
	const config = content.pages[page];
	if (!config) return null;
	const gallery = config.gallery;
	const images = gallery ? (galleries[gallery.folder] ?? []) : [];
	const onLayoutChange =
		onImageLayout && gallery ? (id: string, layout: ImageLayout) => onImageLayout(gallery.folder, id, layout) : undefined;
	const textLayoutChange = onTextLayout ? (id: string, layout: TextLayout) => onTextLayout(page, id, layout) : undefined;

	// Text pins to the canvas only when the page renders one (freeform gallery).
	const blocks = config.blocks ?? [];
	const hasCanvas = !!gallery && gallery.layout !== 'grid' && blocks.some((b) => b.type === 'gallery');
	const canvasTexts: CanvasText[] = hasCanvas
		? blocks.flatMap((b) =>
				b.type === 'text' && b.layout ? [{ id: b.id, text: b.text, align: b.align, layout: b.layout }] : [],
			)
		: [];

	const renderBlock = (block: PageBlock) => {
		switch (block.type) {
			case 'text':
				// Pinned texts render inside the canvas instead of the page flow.
				if (hasCanvas && block.layout) return null;
				return textLayoutChange && hasCanvas ? (
					<DraggableFlowText key={block.id} onPlace={(layout) => textLayoutChange(block.id, layout)}>
						<TextBlock text={block.text} align={block.align} />
					</DraggableFlowText>
				) : (
					<TextBlock key={block.id} text={block.text} align={block.align} />
				);
			case 'embed':
				return <Embed key={block.id} url={block.url} />;
			case 'about': {
				const resume =
					content.resume && content.resume.url
						? { label: content.resume.label, href: withBase(base, content.resume.url) }
						: null;
				return (
					<About
						key={block.id}
						name={content.site.name}
						bio={content.profile.bio}
						email={content.contact.email}
						social={content.social}
						profileImageSrc={profileImageSrc}
						resume={resume}
					/>
				);
			}
			case 'children': {
				const items = (config.children ?? []).map((key) => ({
					key,
					label: content.pages[key]?.label ?? key,
					href: withBase(base, `${key}/`),
					thumbSrc: pageThumbs?.[key],
				}));
				return <ChildPages key={block.id} items={items} onNavigate={onNavigate} />;
			}
			case 'gallery': {
				const galleryEl = (
					<Gallery
						images={images}
						alt={gallery?.alt}
						settings={gallery}
						texts={canvasTexts}
						editable={!!onLayoutChange}
						onLayoutChange={onLayoutChange}
						onTextLayout={textLayoutChange}
					/>
				);
				// Home keeps its collage layout; other pages the standard wrapper (the
				// page-photo modifier preserves the original photography page's spacing).
				return page === 'home' ? (
					<div key={block.id} className="collage-container">
						{galleryEl}
					</div>
				) : (
					<div key={block.id} className={`page-content-wrapper ${page === 'photography' ? 'page-photo' : ''}`}>
						{galleryEl}
					</div>
				);
			}
		}
	};

	return (
		<>
			<Hero heading={config.heading} />
			{blocks.map(renderBlock)}
		</>
	);
}
