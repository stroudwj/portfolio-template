// Configuration for the Lemon Squeezy license gate. Fill these in from your Lemon Squeezy
// product (Store → the product/variant). The IDs let the editor confirm a pasted key is for
// THIS product, not just any Lemon Squeezy key.
//
// Until a product id is set, `isLicenseGateEnabled()` is false and Publish is NOT gated —
// so the editor works exactly as before while you set up the store.
export const LEMONSQUEEZY_STORE_ID = 431697; // your Store ID (number)
export const LEMONSQUEEZY_PRODUCT_ID = 1221404; // the product's ID (number)
export const LEMONSQUEEZY_VARIANT_ID = 1909567; // optional; 0 = don't check the variant
export const CHECKOUT_URL = 'https://simpleportfolio.lemonsqueezy.com/checkout/buy/5c59c4be-c5f6-4c4e-b48d-d48e026f9ad4'; // where buyers purchase a license

/** Lemon Squeezy's License API is CORS-enabled, so the editor calls it directly (no proxy). */
export const LICENSE_API = 'https://api.lemonsqueezy.com/v1';

/** A stable name for this activation "instance" (shown in your LS dashboard). */
export const INSTANCE_NAME = 'portfolio-editor';

/** True once a product id is configured; gates whether Publish requires a license. */
export function isLicenseGateEnabled(): boolean {
	return LEMONSQUEEZY_PRODUCT_ID > 0;
}
