// Playful site-wide flourishes (all opt-in from the editor's Design area):
//   - an emoji cursor,
//   - a little trail of shapes following the pointer,
//   - a paper-grain texture laid over the whole page,
//   - temporary click marks, loose-hung artwork, a slow reveal,
//   - artwork wobble and a hover-driven color spin.
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
	const filmRef = useRef<HTMLCanvasElement>(null);
	const [isPhone, setIsPhone] = useState(false);
	const cursor = creative?.cursor?.trim() || '';
	const effectOnPhone = (key: keyof NonNullable<CreativeConfig['phone']>) =>
		!isPhone || creative?.phone?.[key] !== false;
	const trail = effectOnPhone('trail') ? creative?.trail : undefined;
	const grain = Math.min(Math.max(creative?.grain ?? 0, 0), 30);
	const clickMark = effectOnPhone('clickMark') ? creative?.clickMark : undefined;
	const film = effectOnPhone('film') ? creative?.film : undefined;
	const pageTransition = creative?.pageTransition;

	/** The element the effects attach to: preview pane root, else the page body. */
	const hostOf = (el: HTMLElement): HTMLElement =>
		el.closest<HTMLElement>('.portfolio-root') ?? el.ownerDocument.body;

	useEffect(() => {
		const win = overlayRef.current?.ownerDocument.defaultView;
		if (!win) return;
		const query = win.matchMedia('(max-width: 639px)');
		const update = () => setIsPhone(query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, [creative]);

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

	// Capture pointer-down before gallery drag/lightbox handlers can stop bubbling.
	// The mark never intercepts the action, so it can safely appear over every part
	// of the portfolio instead of leaving artwork-sized dead zones.
	useEffect(() => {
		const el = overlayRef.current;
		if (!el || !clickMark) return;
		const host = hostOf(el);
		const onPointerDown = (ev: PointerEvent) => {
			if (!ev.isPrimary || ev.button !== 0) return;
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
		host.addEventListener('pointerdown', onPointerDown, { capture: true });
		return () => host.removeEventListener('pointerdown', onPointerDown, { capture: true });
	}, [clickMark]);

	// Living film surface. A small randomized tile is repeated across a viewport-
	// sized canvas at a deliberately cinematic low frame rate. The scheduler
	// pauses in background tabs and never requests high-DPI pixels.
	useEffect(() => {
		const canvas = filmRef.current;
		if (!canvas || !film) return;
		const overlay = overlayRef.current;
		if (!overlay) return;
		const doc = canvas.ownerDocument;
		const win = doc.defaultView;
		if (!win) return;
		const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
		const ctx = canvas.getContext('2d', { alpha: true });
		if (!ctx) return;
		const tile = doc.createElement('canvas');
		const tileCtx = tile.getContext('2d', { alpha: true });
		if (!tileCtx) return;
		const size = Math.min(Math.max(film.size ?? 100, 50), 200);
		const tileSize = Math.round(210 * (100 / size));
		tile.width = tileSize;
		tile.height = tileSize;
		const intensity = Math.min(Math.max(film.intensity ?? 12, 1), 30);
		const speed = Math.min(Math.max(film.speed ?? 100, 25), 200);
		const interval = Math.round(1000 / (6 + speed / 18));
		const flicker = film.flicker ?? film.preset === 'projector';
		const weave = film.weave ?? film.preset === 'projector';
		let timer = 0;

		const resize = () => {
			const rect = overlay.getBoundingClientRect();
			canvas.width = Math.max(1, Math.ceil(rect.width));
			canvas.height = Math.max(1, Math.ceil(rect.height));
		};
		const draw = () => {
			const pixels = tileCtx.createImageData(tileSize, tileSize);
			for (let index = 0; index < pixels.data.length; index += 4) {
				const value = Math.random() > 0.5 ? 232 : 18;
				pixels.data[index] = value;
				pixels.data[index + 1] = value;
				pixels.data[index + 2] = value;
				pixels.data[index + 3] = Math.round(24 + Math.random() * 58);
			}
			tileCtx.putImageData(pixels, 0, 0);
			if (film.preset !== 'fine-grain') {
				const dustCount = film.preset === 'dust' ? 10 : 5;
				tileCtx.fillStyle = 'rgba(245,245,238,.62)';
				for (let i = 0; i < dustCount; i += 1) {
					const radius = 0.5 + Math.random() * 2.4;
					tileCtx.beginPath();
					tileCtx.arc(Math.random() * tileSize, Math.random() * tileSize, radius, 0, Math.PI * 2);
					tileCtx.fill();
				}
			}
			if (film.preset === 'projector' && Math.random() > 0.62) {
				tileCtx.strokeStyle = 'rgba(250,248,240,.48)';
				tileCtx.lineWidth = Math.random() > 0.8 ? 2 : 1;
				const x = Math.random() * tileSize;
				tileCtx.beginPath();
				tileCtx.moveTo(x, -10);
				tileCtx.lineTo(x + Math.random() * 4 - 2, tileSize + 10);
				tileCtx.stroke();
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			const pattern = ctx.createPattern(tile, 'repeat');
			if (pattern) {
				ctx.fillStyle = pattern;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}
			canvas.style.opacity = String((intensity / 100) * (flicker ? 0.86 + Math.random() * 0.28 : 1));
			canvas.style.transform = weave
				? `translate(${(Math.random() * 1.6 - 0.8).toFixed(2)}px, ${(Math.random() * 1.2 - 0.6).toFixed(2)}px)`
				: '';
		};
		const start = () => {
			win.clearInterval(timer);
			draw();
			if (!reduced.matches && !doc.hidden) timer = win.setInterval(draw, interval);
		};
		const visibility = () => start();
		resize();
		start();
		const observer = new win.ResizeObserver(() => {
			resize();
			draw();
		});
		observer.observe(overlay);
		doc.addEventListener('visibilitychange', visibility);
		reduced.addEventListener('change', start);
		return () => {
			win.clearInterval(timer);
			observer.disconnect();
			doc.removeEventListener('visibilitychange', visibility);
			reduced.removeEventListener('change', start);
		};
	}, [film]);

	const hasOverlay = !!(
		cursor ||
		creative?.trail ||
		grain ||
		creative?.clickMark ||
		creative?.film
	);
	if (!hasOverlay && !pageTransition) return null;
	return (
		<>
			{pageTransition && <style>{'@view-transition { navigation: auto; }'}</style>}
			{hasOverlay && (
				<div ref={overlayRef} className="creative-effects">
					{grain > 0 && (
						<div
							className="creative-grain"
							style={{ opacity: grain / 100, backgroundImage: GRAIN_TILE }}
							aria-hidden="true"
						/>
					)}
					{film && (
						<canvas
							ref={filmRef}
							className={`creative-film creative-film-${film.preset}`}
							aria-hidden="true"
						/>
					)}
				</div>
			)}
		</>
	);
}
