// A single celebration burst for the moment a publish goes live — the one
// sanctioned use of confetti (DESIGN.md, Motion). Brand colors only, about 2.5s,
// skipped entirely under prefers-reduced-motion. Renders nothing itself: it draws
// paper slips on a throwaway full-screen canvas and removes it when they settle.
import { useEffect } from 'react';

const BRAND_VARS: Array<[token: string, fallback: string]> = [
	['--klein', '#002FA7'],
	['--klein-press', '#00248A'],
	['--ink', '#1A1A1A'],
	['--paper', '#FAF8F5'],
	['--wall-2', '#DDD9D0'],
];

interface Piece {
	x: number;
	y: number;
	vx: number;
	vy: number;
	angle: number;
	spin: number;
	width: number;
	height: number;
	color: string;
}

const LIFETIME_MS = 2600;
const GRAVITY = 1350; // px/s²
const DRAG = 0.16; // fraction of velocity shed per second

export default function ConfettiBurst() {
	useEffect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		Object.assign(canvas.style, {
			position: 'fixed',
			inset: '0',
			width: '100%',
			height: '100%',
			pointerEvents: 'none',
			zIndex: '2000',
		});
		ctx.scale(dpr, dpr);
		document.body.appendChild(canvas);

		const rootStyle = getComputedStyle(document.documentElement);
		const colors = BRAND_VARS.map(
			([token, fallback]) => rootStyle.getPropertyValue(token).trim() || fallback,
		);

		// Two cannons at the lower corners firing up and inward.
		const pieces: Piece[] = [];
		const w = window.innerWidth;
		const h = window.innerHeight;
		for (const side of [-1, 1]) {
			for (let i = 0; i < 70; i++) {
				const aim = -Math.PI / 2 + side * -0.35; // up, tilted toward center
				const angle = aim + (Math.random() - 0.5) * 0.9;
				const speed = 750 + Math.random() * 750;
				pieces.push({
					x: side === -1 ? -10 : w + 10,
					y: h * (0.55 + Math.random() * 0.25),
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					angle: Math.random() * Math.PI,
					spin: (Math.random() - 0.5) * 12,
					width: 5 + Math.random() * 5,
					height: 8 + Math.random() * 8,
					color: colors[i % colors.length],
				});
			}
		}

		let raf = 0;
		let last = performance.now();
		const started = last;
		const frame = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			const age = now - started;
			ctx.clearRect(0, 0, w, h);
			const fade = age > LIFETIME_MS - 500 ? Math.max(0, (LIFETIME_MS - age) / 500) : 1;
			ctx.globalAlpha = fade;
			for (const p of pieces) {
				p.vy += GRAVITY * dt;
				p.vx -= p.vx * DRAG * dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.angle += p.spin * dt;
				if (p.y > h + 30) continue;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(p.angle);
				// A slip of paper tumbling: squash width to fake the third axis.
				ctx.fillStyle = p.color;
				ctx.fillRect((-p.width / 2) * Math.sin(p.angle * 1.7), -p.height / 2, Math.max(1.2, p.width * Math.cos(p.angle * 1.3)), p.height);
				ctx.restore();
			}
			if (age < LIFETIME_MS) raf = requestAnimationFrame(frame);
			else canvas.remove();
		};
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			canvas.remove();
		};
	}, []);
	return null;
}
