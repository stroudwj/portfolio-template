import type { ResolvedImage } from './types';

/** Stable classes shared by grid, legacy masonry, carousel and freeform artwork. */
export function artworkEffectClass(image: ResolvedImage): string {
	const effects = image.effects;
	if (!effects) return '';
	return [
		effects.hover && `artwork-hover-${effects.hover}`,
		effects.reveal && `artwork-reveal-${effects.reveal}`,
		effects.phone === false && 'artwork-effects-phone-off',
	]
		.filter(Boolean)
		.join(' ');
}
