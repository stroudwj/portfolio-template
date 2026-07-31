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

/** Per-artwork physical controls as CSS variables, shared by every gallery mode. */
export function artworkEffectStyle(image: ResolvedImage): CSSProperties {
	const skew = image.effects?.skew;
	if (skew === undefined) return {};
	return {
		'--artwork-skew': `${Math.min(Math.max(skew, -6), 6)}deg`,
	} as CSSProperties;
}
