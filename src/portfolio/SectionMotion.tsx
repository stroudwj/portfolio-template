import { useEffect } from 'react';
import './SectionMotion.css';

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Animatable children of a sequence section. Keep in sync with the
 * `.motion-effect-sequence` selectors in SectionMotion.css. */
const SEQUENCE_ITEMS =
	'.masonry-item, .uniform-item, .canvas-item, .child-card, .text-block, .product-card, .about-layout';

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
	/** Changes whenever a scene is added, removed, or adjusted at any level. */
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
		/** Elements whose entrance has played. React owns className, so an edit
		 * that re-renders a section (color, bleed) silently drops our
		 * `motion-visible`; this set is the durable record that lets the class
		 * guard below put it back instead of leaving the section invisible. */
		const entered = new WeakSet<HTMLElement>();

		const enabled = (section: HTMLElement): boolean =>
			!reduced.matches && (!phone.matches || section.dataset.motionPhone === 'true');

		const markEntered = (el: HTMLElement) => {
			entered.add(el);
			el.classList.add('motion-visible');
			el.classList.remove('motion-pending');
		};

		const classGuard = new win.MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const el = mutation.target as HTMLElement;
				if (entered.has(el) && !el.classList.contains('motion-visible'))
					el.classList.add('motion-visible');
			}
		});

		const revealAllDisabled = () => {
			for (const section of sections) {
				const active = enabled(section);
				section.classList.toggle('motion-disabled', !active);
				if (!active) section.classList.add('motion-visible');
			}
		};

		const observe = (replay: boolean) => {
			observer?.disconnect();
			// A visibility-ratio threshold can never fire on a section much taller
			// than the viewport (the ratio tops out at viewport ÷ section height),
			// so intersect at the first pixel instead and let the rootMargin demand
			// a meaningful entry distance.
			observer = new win.IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							markEntered(entry.target as HTMLElement);
							observer?.unobserve(entry.target);
						}
					}
				},
				{ threshold: 0, rootMargin: '0px 0px -8% 0px' },
			);
			for (const section of sections) {
				if (!enabled(section)) continue;
				const effect = section.dataset.motionEffect;
				if (effect === 'reveal') {
					// A scene change (replay) strips the entered state so the entrance
					// plays again — the editor's live preview of what a visitor sees on
					// load. Media flips (rotation, reduced-motion) keep it, so published
					// sites never re-animate content the visitor already has.
					if (replay) entered.delete(section);
					if (entered.has(section)) section.classList.add('motion-visible');
					else {
						section.classList.remove('motion-visible');
						observer.observe(section);
					}
				} else if (effect === 'sequence') {
					// Items enter individually so a wall deeper than the viewport
					// staggers with the scroll. Hiding is opt-in (motion-pending) so
					// items this pass never saw fail visible, not stuck at opacity 0.
					markEntered(section);
					for (const item of section.querySelectorAll<HTMLElement>(SEQUENCE_ITEMS)) {
						if (replay) {
							entered.delete(item);
							item.classList.remove('motion-visible');
						}
						if (entered.has(item) || item.classList.contains('motion-visible')) {
							markEntered(item);
							continue;
						}
						item.classList.add('motion-pending');
						observer.observe(item);
					}
				} else markEntered(section);
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
				const strength = Math.min(Math.max(Number(section.dataset.motionStrength) || 45, 1), 100);
				if (effect === 'drift') {
					const progress = clamp01((viewport - rect.top) / (viewport + rect.height));
					section.style.setProperty('--motion-y', `${((0.5 - progress) * strength * 1.35).toFixed(2)}px`);
					continue;
				}
				// Scrub completes while the section is still readable: progress hits 1
				// as its top reaches ~15% of the viewport. Normalizing over the section
				// height instead would keep it translucent and blurred until it had
				// fully scrolled past — sharp only once nobody can see it.
				const progress = clamp01((viewport - rect.top) / (viewport * 0.85));
				section.style.setProperty('--motion-y', `${((1 - progress) * strength * 0.7).toFixed(2)}px`);
				section.style.setProperty('--motion-scale', (0.94 + progress * 0.06).toFixed(4));
				section.style.setProperty('--motion-opacity', (0.45 + progress * 0.55).toFixed(3));
				section.style.setProperty('--motion-blur', `${((1 - progress) * Math.min(strength / 8, 10)).toFixed(2)}px`);
			}
		};

		const schedule = () => {
			if (!frame) frame = win.requestAnimationFrame(updateContinuous);
		};
		const reset = (replay: boolean) => {
			revealAllDisabled();
			observe(replay);
			schedule();
		};
		const resetKeepEntered = () => reset(false);

		root.classList.add('motion-runtime-ready');
		reset(true);
		for (const section of sections)
			classGuard.observe(section, { attributes: true, attributeFilter: ['class'] });
		win.addEventListener('scroll', schedule, { passive: true });
		win.addEventListener('resize', schedule, { passive: true });
		reduced.addEventListener('change', resetKeepEntered);
		phone.addEventListener('change', resetKeepEntered);
		return () => {
			root.classList.remove('motion-runtime-ready');
			observer?.disconnect();
			classGuard.disconnect();
			if (frame) win.cancelAnimationFrame(frame);
			win.removeEventListener('scroll', schedule);
			win.removeEventListener('resize', schedule);
			reduced.removeEventListener('change', resetKeepEntered);
			phone.removeEventListener('change', resetKeepEntered);
		};
	}, [root, signature]);

	return null;
}
