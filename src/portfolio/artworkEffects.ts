import type { ResolvedImage } from './types';
import type { CSSProperties } from 'react';

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
