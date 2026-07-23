// Recognizes a pasted Stripe Payment Link (Direction D, Subsystem 6). The artist sells
// through their OWN Stripe account: the link renders as a buy button that sends the
// visitor to Stripe's hosted checkout, so Stripe owns payment/PCI/tax/receipts and the
// site (and Hangwork) is never in the payment path. Host-allowlisted the same way
// videoEmbed.ts is — anything unrecognized returns null and falls back to a plain link.

/** Normalized Stripe Payment Link URL, or null if `raw` isn't one. */
export function stripePaymentLink(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	const host = url.hostname.toLowerCase();
	if (host !== 'buy.stripe.com' && host !== 'book.stripe.com' && host !== 'donate.stripe.com') return null;
	const segs = url.pathname.split('/').filter(Boolean);
	// Payment links look like /28o5nc4ryeAvfEkfYY (optionally /test_… in test mode).
	if (segs.length !== 1 || !/^[A-Za-z0-9_]{4,64}$/.test(segs[0])) return null;
	return `https://${host}/${segs[0]}`;
}
