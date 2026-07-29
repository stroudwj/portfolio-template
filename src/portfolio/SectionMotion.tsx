import { useEffect } from 'react';
import './SectionMotion.css';

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * One scroll scheduler for all of a page's motion sections. IntersectionObserver
 * handles discrete entrances; a single passive scroll listener updates every
 * continuous scene so adding scenes never adds listeners one-by-one.
 */
export default function SectionMotionRuntime({
	root,
	signature,
}: {
	root: HTMLElement | null;
	/** Changes whenever a section preset is added, removed, or adjusted. */
	signature: string;
}) {
	useEffect(() => {
		if (!root) return;
		const doc = root.ownerDocument;
		const win = doc.defaultView;
		if (!win) return;
		const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-effect]'));
		if (!sections.length) return;

		const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
		const phone = win.matchMedia('(max-width: 639px)');
		let frame = 0;
		let observer: IntersectionObserver | undefined;

		const enabled = (section: HTMLElement): boolean =>
			!reduced.matches && (!phone.matches || section.dataset.motionPhone === 'true');

		const revealAllDisabled = () => {
			for (const section of sections) {
				const active = enabled(section);
				section.classList.toggle('motion-disabled', !active);
				if (!active) section.classList.add('motion-visible');
			}
		};

		const observe = () => {
			observer?.disconnect();
			observer = new win.IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							(entry.target as HTMLElement).classList.add('motion-visible');
							observer?.unobserve(entry.target);
						}
					}
				},
				{ threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
			);
			for (const section of sections) {
				if (!enabled(section)) continue;
				const effect = section.dataset.motionEffect;
				if (effect === 'reveal' || effect === 'sequence') observer.observe(section);
				else section.classList.add('motion-visible');
			}
		};

		const updateContinuous = () => {
			frame = 0;
			const viewport = Math.max(win.innerHeight, 1);
			for (const section of sections) {
				if (!enabled(section)) continue;
				const effect = section.dataset.motionEffect;
				if (effect !== 'drift' && effect !== 'scrub') continue;
				const rect = section.getBoundingClientRect();
				const progress = clamp01((viewport - rect.top) / (viewport + rect.height));
				const strength = Math.min(Math.max(Number(section.dataset.motionStrength) || 45, 1), 100);
				if (effect === 'drift') {
					section.style.setProperty('--motion-y', `${((0.5 - progress) * strength * 1.35).toFixed(2)}px`);
					continue;
				}
				section.style.setProperty('--motion-y', `${((1 - progress) * strength * 0.7).toFixed(2)}px`);
				section.style.setProperty('--motion-scale', (0.94 + progress * 0.06).toFixed(4));
				section.style.setProperty('--motion-opacity', (0.45 + progress * 0.55).toFixed(3));
				section.style.setProperty('--motion-blur', `${((1 - progress) * Math.min(strength / 8, 10)).toFixed(2)}px`);
			}
		};

		const schedule = () => {
			if (!frame) frame = win.requestAnimationFrame(updateContinuous);
		};
		const reset = () => {
			revealAllDisabled();
			observe();
			schedule();
		};

		root.classList.add('motion-runtime-ready');
		reset();
		win.addEventListener('scroll', schedule, { passive: true });
		win.addEventListener('resize', schedule, { passive: true });
		reduced.addEventListener('change', reset);
		phone.addEventListener('change', reset);
		return () => {
			root.classList.remove('motion-runtime-ready');
			observer?.disconnect();
			if (frame) win.cancelAnimationFrame(frame);
			win.removeEventListener('scroll', schedule);
			win.removeEventListener('resize', schedule);
			reduced.removeEventListener('change', reset);
			phone.removeEventListener('change', reset);
		};
	}, [root, signature]);

	return null;
}
