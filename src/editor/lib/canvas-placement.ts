import { roundLayout } from '../../portfolio/canvasLayout';
import type { ImageLayout } from '../../lib/content';

/** Sensible first frame for complete collection widgets. It is deliberately
 * smaller than the old 90%-wide 16:9 box and always starts after occupied art. */
export function collectionLayoutAtCanvasBottom(
	type: 'children' | 'products',
	occupiedBottom: number,
): ImageLayout {
	const width = type === 'children' ? 58 : 68;
	return roundLayout({
		x: (100 - width) / 2,
		y: Math.max(18, occupiedBottom) + 2,
		w: width,
		ar: type === 'children' ? 3 / 2 : 4 / 3,
	});
}
