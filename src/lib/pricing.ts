/**
 * Hangwork pricing is defined here once so every product surface changes together.
 */
export const pricing = Object.freeze({
	lifetimePrice: 99,
	monthlyPrice: 10,
	monthlyUpgradeCredit: 10,
	refundDays: 14,
});

export const currentPrice = pricing.lifetimePrice;

export function formatPrice(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(amount);
}

export const currentPriceText = formatPrice(currentPrice);
export const monthlyPriceText = formatPrice(pricing.monthlyPrice);
export const monthlyUpgradeCreditText = formatPrice(pricing.monthlyUpgradeCredit);
