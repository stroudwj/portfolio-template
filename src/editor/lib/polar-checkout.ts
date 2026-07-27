import { AccountClient } from '../lib/account/client';
import { getSession } from '../lib/account/session';

export type PolarCheckoutStatus = 'open' | 'expired' | 'confirmed' | 'succeeded' | 'failed';

function client() {
	return new AccountClient(getSession()?.token ?? null);
}

export async function startPolarCheckout(): Promise<void> {
	const { data } = await client().request<{ url: string }>('/checkout/polar');
	if (!data.url) throw new Error('Polar did not return a checkout URL.');
	window.location.assign(data.url);
}

export async function getPolarCheckoutStatus(checkoutId: string): Promise<PolarCheckoutStatus> {
	const { data } = await client().request<{ status: PolarCheckoutStatus }>('/checkout/polar/status', {
		body: { checkout_id: checkoutId },
	});
	return data.status;
}

export function polarCheckoutReturn(): { checkoutId: string } | null {
	if (typeof window === 'undefined') return null;
	const url = new URL(window.location.href);
	if (url.searchParams.get('polar_checkout') !== 'success') return null;
	const checkoutId = url.searchParams.get('checkout_id')?.trim() || '';
	return checkoutId ? { checkoutId } : null;
}

export function isPolarReviewMode(): boolean {
	return typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('polar_review') === '1';
}
