// Playful site-wide flourishes (all opt-in from the editor's ✨ Fun tab):
//   - an emoji cursor,
//   - a little trail of shapes following the pointer,
//   - a paper-grain texture laid over the whole page,
//   - temporary click marks, loose-hung artwork, a slow reveal,
//   - a hide-the-frame view and a tucked-away wall note.
// Rendered in BOTH the editor preview and the published site. Effects scope
// themselves to the nearest .portfolio-root (the preview pane) when one exists,
// else to the document body (the published site), so the editor chrome is never
// affected. The overlay is position:fixed; inside the preview pane that still
// stays contained because .preview-surface creates a transform containing block.
import { useEffect, useRef, useState } from 'react';
import type { CreativeClickMark, CreativeConfig, CreativeTrail } from '../lib/content';
import './CreativeEffects.css';

/** The characters each trail flavor sprinkles behind the pointer. */
const TRAIL_BITS: Record<CreativeTrail, string[]> = {
	sparkles: ['✦', '✧', '⋆', '✶'],
	hearts: ['♥', '♡', '♥'],
	bubbles: ['○', '◦', '°'],
};

/** Minimum pointer travel (px) between two trail bits, so the trail stays airy. */
const TRAIL_SPACING = 28;
/** How long one trail bit lives (must match the CSS animation duration). */
const TRAIL_LIFE_MS = 700;

const CLICK_MARK_BITS: Record<CreativeClickMark, string> = {
	nail: '•',
	cross: '×',
	star: '✶',
};

/** How long a visitor's click mark remains on the wall. */
const CLICK_MARK_LIFE_MS = 1400;

/** An emoji as a 32px SVG cursor image. */
function emojiCursorUrl(emoji: string): string {
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><text y='26' font-size='26'>${emoji}</text></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, auto`;
}

/** Subtle monochrome noise tile (SVG turbulence) for the paper-grain overlay. */
const GRAIN_TILE =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function CreativeEffects({ creative }: { creative?: CreativeConfig }) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const [frameHidden, setFrameHidden] = useState(false);
	const cursor = creative?.cursor?.trim() || '';
	const trail = creative?.trail;
	const grain = Math.min(Math.max(creative?.grain ?? 0, 0), 30);
	const clickMark = creative?.clickMark;
	const looseHang = creative?.looseHang ?? false;
	const slowReveal = creative?.slowReveal ?? false;
	const quietMode = creative?.quietMode ?? false;
	const wallNote = creative?.wallNote?.trim().slice(0, 80) || '';

	/** The element the effects attach to: preview pane root, else the page body. */
	const hostOf = (el: HTMLElement): HTMLElement =>
		el.closest<HTMLElement>('.portfolio-root') ?? el.ownerDocument.body;

	// Emoji cursor.
	useEffect(() => {
		const el = overlayRef.current;
		if (!el || !cursor) return;
		const host = hostOf(el);
		host.style.cursor = emojiCursorUrl(cursor);
		return () => {
			host.style.cursor = '';
		};
	}, [cursor]);

	// Pointer trail: spawn short-lived, self-removing spans directly in the DOM —
	// running this through React state would re-render the whole portfolio per bit.
	useEffect(() => {
		const el = overlayRef.current;
		if (!el || !trail) return;
		const host = hostOf(el);
		const bits = TRAIL_BITS[trail];
		let lastX = -Infinity;
		let lastY = -Infinity;
		const onMove = (ev: PointerEvent) => {
			if (Math.hypot(ev.clientX - lastX, ev.clientY - lastY) < TRAIL_SPACING) return;
			lastX = ev.clientX;
			lastY = ev.clientY;
			const rect = el.getBoundingClientRect();
			const bit = el.ownerDocument.createElement('span');
			bit.className = 'creative-trail-bit';
			bit.textContent = bits[Math.floor(Math.random() * bits.length)];
			bit.style.left = `${ev.clientX - rect.left}px`;
			bit.style.top = `${ev.clientY - rect.top}px`;
			bit.style.setProperty('--tr', `${(Math.random() * 60 - 30).toFixed(0)}deg`);
			bit.style.setProperty('--ts', (0.7 + Math.random() * 0.6).toFixed(2));
			el.appendChild(bit);
			setTimeout(() => bit.remove(), TRAIL_LIFE_MS + 100);
		};
		host.addEventListener('pointermove', onMove);
		return () => host.removeEventListener('pointermove', onMove);
	}, [trail]);

	// Click marks are decorative and temporary. Interactive elements and artwork
	// are left alone so a visitor never trades a real action for a flourish.
	useEffect(() => {
		const el = overlayRef.current;
		if (!el || !clickMark) return;
		const host = hostOf(el);
		const onPointerDown = (ev: PointerEvent) => {
			if (!ev.isPrimary || ev.button !== 0) return;
			const target = ev.target;
			if (
				target instanceof Element &&
				target.closest('a, button, input, textarea, select, summary, iframe, video, img, [role="button"], .modal')
			)
				return;
			const rect = el.getBoundingClientRect();
			const mark = el.ownerDocument.createElement('span');
			mark.className = 'creative-click-mark';
			mark.textContent = CLICK_MARK_BITS[clickMark];
			mark.style.left = `${ev.clientX - rect.left}px`;
			mark.style.top = `${ev.clientY - rect.top}px`;
			mark.style.setProperty('--mr', `${(Math.random() * 18 - 9).toFixed(0)}deg`);
			el.appendChild(mark);
			setTimeout(() => mark.remove(), CLICK_MARK_LIFE_MS + 100);
		};
		host.addEventListener('pointerdown', onPointerDown);
		return () => host.removeEventListener('pointerdown', onPointerDown);
	}, [clickMark]);

	useEffect(() => {
		if (quietMode) return;
		setFrameHidden(false);
	}, [quietMode]);

	useEffect(() => {
		const el = overlayRef.current;
		if (!el || !quietMode) return;
		const host = hostOf(el);
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key.toLowerCase() !== 'h' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
			const target = ev.target as HTMLElement | null;
			if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
			setFrameHidden((hidden) => !hidden);
		};
		host.ownerDocument.addEventListener('keydown', onKeyDown);
		return () => host.ownerDocument.removeEventListener('keydown', onKeyDown);
	}, [quietMode]);

	useEffect(() => {
		const el = overlayRef.current;
		if (!el) return;
		const host = hostOf(el);
		host.classList.toggle('creative-frame-hidden', quietMode && frameHidden);
		return () => host.classList.remove('creative-frame-hidden');
	}, [quietMode, frameHidden]);

	if (!cursor && !trail && !grain && !clickMark && !looseHang && !slowReveal && !quietMode && !wallNote)
		return null;
	return (
		<div ref={overlayRef} className="creative-effects">
			{grain > 0 && (
				<div
					className="creative-grain"
					style={{ opacity: grain / 100, backgroundImage: GRAIN_TILE }}
					aria-hidden="true"
				/>
			)}
			{wallNote && <p className="creative-wall-note">{wallNote}</p>}
			{quietMode && (
				<button
					type="button"
					className="creative-frame-toggle"
					onClick={() => setFrameHidden((hidden) => !hidden)}
					aria-pressed={frameHidden}
				>
					{frameHidden ? 'Show frame' : 'Hide frame'}
				</button>
			)}
		</div>
	);
}
