/**
 * Hangwork pricing is defined here once so every product surface changes together.
 * Flip `launchPricingActive` off when launch pricing ends; the regular price then
 * becomes the current price and all launch anchors disappear.
 */
export const pricing = Object.freeze({
	launchPrice: 49,
	regularPrice: 79,
	refundDays: 14,
	launchPricingActive: true,
});

export const currentPrice = pricing.launchPricingActive ? pricing.launchPrice : pricing.regularPrice;

export function formatPrice(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(amount);
}

export const currentPriceText = formatPrice(currentPrice);
export const regularPriceText = formatPrice(pricing.regularPrice);
