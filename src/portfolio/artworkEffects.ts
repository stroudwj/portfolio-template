import type { ResolvedImage } from './types';
import type { ArtworkMount } from '../lib/content';
import type { CSSProperties } from 'react';

/** Every mount choice in display order — the sidebar dropdown and the canvas
 * fixture switcher must always offer the same catalog. */
export const ARTWORK_MOUNTS: Array<{ value: ArtworkMount | ''; label: string }> = [
	{ value: '', label: 'None' },
	{ value: 'tape', label: 'Permanent tape' },
	{ value: 'nail', label: 'Nail' },
	{ value: 'tack', label: 'Thumbtack' },
	{ value: 'hook', label: 'Picture hook' },
	{ value: 'frame', label: 'Physical frame' },
	{ value: 'frame-oak', label: 'Oak frame' },
	{ value: 'frame-walnut', label: 'Walnut frame' },
	{ value: 'mat', label: 'Gallery mat' },
	{ value: 'corners-nail', label: 'Nailed corners' },
	{ value: 'corners-tape', label: 'Taped corners' },
	{ value: 'corners-tack', label: 'Tacked corners' },
	{ value: 'photo-corners', label: 'Photo corners' },
];

/** Stable classes shared by grid, legacy masonry, carousel and freeform artwork. */
export function artworkEffectClass(image: ResolvedImage): string {
	const effects = image.effects;
	if (!effects) return '';
	return [
		effects.hover && `artwork-hover-${effects.hover}`,
		effects.reveal && `artwork-reveal-${effects.reveal}`,
		effects.hang === true && 'artwork-hang-on',
		effects.hang === false && 'artwork-hang-off',
		effects.skew !== undefined && 'artwork-skew-custom',
		effects.mount && `artwork-mount-${effects.mount}`,
		effects.phone === false && 'artwork-effects-phone-off',
	]
		.filter(Boolean)
		.join(' ');
}

/** Non-destructive light adjustment as a CSS filter, or undefined when as shot. */
export function artworkAdjustFilter(image: {
	brightness?: number;
	contrast?: number;
}): string | undefined {
	const parts: string[] = [];
	if (image.brightness !== undefined && image.brightness !== 100)
		parts.push(`brightness(${Math.min(Math.max(image.brightness, 50), 150) / 100})`);
	if (image.contrast !== undefined && image.contrast !== 100)
		parts.push(`contrast(${Math.min(Math.max(image.contrast, 50), 150) / 100})`);
	return parts.length ? parts.join(' ') : undefined;
}

/** Per-artwork physical controls as CSS variables, shared by every gallery mode. */
export function artworkEffectStyle(image: ResolvedImage): CSSProperties {
	const style: Record<string, string> = {};
	const skew = image.effects?.skew;
	if (skew !== undefined) style['--artwork-skew'] = `${Math.min(Math.max(skew, -6), 6)}deg`;
	const adjust = artworkAdjustFilter(image);
	if (adjust) style['--artwork-adjust'] = adjust;
	return style as CSSProperties;
}
