import { AccountClient } from '../lib/account/client';
import { getSession } from '../lib/account/session';
import { funnelStep } from '../../lib/funnel';

export type PolarCheckoutStatus = 'open' | 'expired' | 'confirmed' | 'succeeded' | 'failed';
export type HangworkPlan = 'lifetime' | 'monthly';

const RESUME_KEY = 'portfolio-editor:resume-publish';
let checkoutReturnRead = false;
let cachedCheckoutReturn: { checkoutId: string } | null = null;

function client() {
	return new AccountClient(getSession()?.token ?? null);
}

export async function startPolarCheckout(plan: HangworkPlan): Promise<void> {
	// Funnel step 7 of 7 — checkout started. The purchase itself is never beaconed:
	// the Polar webhook records it in D1, which the dashboard reads instead.
	funnelStep('checkout');
	const { data } = await client().request<{ url: string }>('/checkout/polar', {
		body: { plan },
	});
	if (!data.url) throw new Error('Polar did not return a checkout URL.');
	window.location.assign(data.url);
}

export async function getPolarCheckoutStatus(checkoutId: string): Promise<{ status: PolarCheckoutStatus; plan: HangworkPlan }> {
	const { data } = await client().request<{ status: PolarCheckoutStatus; plan: HangworkPlan }>('/checkout/polar/status', {
		body: { checkout_id: checkoutId },
	});
	return data;
}

/**
 * Read a successful Polar return once, then scrub its checkout id from the address bar.
 * The memoized result lets every mounted account surface observe the same return without
 * leaving a purchase identifier in browser history or referrer headers.
 */
export function completePolarCheckoutReturn(): { checkoutId: string } | null {
	if (checkoutReturnRead) return cachedCheckoutReturn;
	checkoutReturnRead = true;
	if (typeof window === 'undefined') return null;
	const url = new URL(window.location.href);
	if (url.searchParams.get('polar_checkout') !== 'success') return null;
	const checkoutId = url.searchParams.get('checkout_id')?.trim() || '';
	url.searchParams.delete('polar_checkout');
	url.searchParams.delete('checkout_id');
	url.searchParams.delete('polar_review');
	window.history.replaceState({}, '', url.pathname + url.search + url.hash);
	cachedCheckoutReturn = checkoutId ? { checkoutId } : null;
	return cachedCheckoutReturn;
}

export function markResumePublish(): void {
	try {
		sessionStorage.setItem(RESUME_KEY, '1');
	} catch {
		/* private mode — resuming is a convenience */
	}
}

export function shouldResumePublish(): boolean {
	try {
		return sessionStorage.getItem(RESUME_KEY) === '1';
	} catch {
		return false;
	}
}

export function clearResumePublish(): void {
	try {
		sessionStorage.removeItem(RESUME_KEY);
	} catch {
		/* ignore */
	}
}
