/**
 * Hangwork pricing is defined here once so every product surface changes together.
 */
export const pricing = Object.freeze({
	lifetimePrice: 99,
	monthlyPrice: 10,
	monthlyUpgradeCredit: 10,
	refundDays: 14,
	/** Free days on the monthly plan before the first charge. The Polar monthly
	 * product must carry the same trial length — this constant only drives copy
	 * and the worker's trialing-subscription entitlement. */
	monthlyTrialDays: 3,
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
