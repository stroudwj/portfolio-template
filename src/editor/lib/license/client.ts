// Thin wrapper over the Lemon Squeezy License API (activate / validate). It's a public API
// authenticated by the license key itself — no store API key in the browser — and it's
// CORS-enabled, so the editor talks to it directly, the same way it talks to GitHub.
// `fetch` is injectable so this can be unit-tested offline.
import {
	INSTANCE_NAME,
	LEMONSQUEEZY_PRODUCT_ID,
	LEMONSQUEEZY_STORE_ID,
	LEMONSQUEEZY_VARIANT_ID,
	LICENSE_API,
} from './config';

export type FetchFn = typeof fetch;

/** A license error carrying a friendly, user-facing message. */
export class LicenseError extends Error {
	constructor(public friendly: string) {
		super(friendly);
		this.name = 'LicenseError';
	}
}

interface LicenseMeta {
	store_id: number;
	product_id: number;
	variant_id: number;
}
interface LicenseResponse {
	activated?: boolean;
	valid?: boolean;
	error?: string | null;
	instance?: { id: string; name: string } | null;
	meta?: LicenseMeta;
}

async function post(path: string, params: Record<string, string>, fetchImpl: FetchFn = fetch): Promise<LicenseResponse> {
	const doFetch = fetchImpl; // bare local — see github/client.ts for why
	let res: Response;
	try {
		res = await doFetch(LICENSE_API + path, {
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params).toString(),
		});
	} catch {
		throw new LicenseError('Couldn’t reach the license service. Check your connection (or an ad/privacy blocker) and try again.');
	}
	return (await res.json().catch(() => ({}))) as LicenseResponse;
}

/** Confirm a key belongs to THIS product (not just any Lemon Squeezy key). */
function belongsToProduct(meta: LicenseMeta | undefined): boolean {
	if (!meta) return false;
	if (LEMONSQUEEZY_STORE_ID && meta.store_id !== LEMONSQUEEZY_STORE_ID) return false;
	if (meta.product_id !== LEMONSQUEEZY_PRODUCT_ID) return false;
	if (LEMONSQUEEZY_VARIANT_ID && meta.variant_id !== LEMONSQUEEZY_VARIANT_ID) return false;
	return true;
}

/** Activate a key (first unlock). Returns the instance id to store. Throws LicenseError. */
export async function activateLicense(key: string, fetchImpl?: FetchFn): Promise<{ instanceId: string }> {
	const data = await post('/licenses/activate', { license_key: key, instance_name: INSTANCE_NAME }, fetchImpl);
	if (!data.activated) {
		if (/activation limit/i.test(data.error || '')) {
			throw new LicenseError('This license has reached its device limit. Deactivate it on another device, or buy another license.');
		}
		throw new LicenseError(data.error ? `Couldn’t unlock: ${data.error}` : 'That license key wasn’t accepted. Please double-check it.');
	}
	if (!belongsToProduct(data.meta)) {
		throw new LicenseError('That key is valid, but it’s for a different product.');
	}
	if (!data.instance?.id) {
		throw new LicenseError('Lemon Squeezy didn’t return an activation id. Please try again.');
	}
	return { instanceId: data.instance.id };
}

/** Re-check a stored key+instance on load. Returns true if still valid for this product. */
export async function validateLicense(key: string, instanceId: string, fetchImpl?: FetchFn): Promise<boolean> {
	const data = await post('/licenses/validate', { license_key: key, instance_id: instanceId }, fetchImpl);
	return Boolean(data.valid && belongsToProduct(data.meta));
}
