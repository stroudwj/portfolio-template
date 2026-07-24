import { useEffect, useRef, useState } from 'react';
import { readableTextVars } from './theme';

/** Keep floating logo/navigation ink readable over the section currently behind it. */
export function useChromeContrast<T extends HTMLElement>(
	enabled: boolean,
	fallbackBackground: string,
) {
	const ref = useRef<T>(null);
	const [ink, setInk] = useState<string | undefined>(undefined);

	useEffect(() => {
		const element = ref.current;
		if (!element || !enabled) {
			setInk(undefined);
			return;
		}
		const doc = element.ownerDocument;
		const win = doc.defaultView ?? window;
		let frame = 0;
		const update = () => {
			frame = 0;
			const box = element.getBoundingClientRect();
			const probeY = Math.min(
				Math.max(box.top + Math.min(box.height / 2, 48), 0),
				win.innerHeight - 1,
			);
			let background = fallbackBackground;
			for (const part of Array.from(
				doc.querySelectorAll<HTMLElement>('.portfolio-page-part'),
			)) {
				const partBox = part.getBoundingClientRect();
				if (partBox.top <= probeY && partBox.bottom >= probeY) {
					background = part.dataset.sectionColor || fallbackBackground;
					break;
				}
			}
			const next = readableTextVars(background)['--color-text'];
			setInk((current) => (current === next ? current : next));
		};
		const schedule = () => {
			if (!frame) frame = win.requestAnimationFrame(update);
		};
		update();
		win.addEventListener('scroll', schedule, { passive: true });
		win.addEventListener('resize', schedule);
		const observer = new ResizeObserver(schedule);
		observer.observe(element);
		return () => {
			if (frame) win.cancelAnimationFrame(frame);
			win.removeEventListener('scroll', schedule);
			win.removeEventListener('resize', schedule);
			observer.disconnect();
		};
	}, [enabled, fallbackBackground]);

	return { ref, ink };
}
