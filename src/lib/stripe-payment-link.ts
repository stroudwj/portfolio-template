/**
 * Strict Stripe Payment Link handling for Store products.
 *
 * Store checkout links deliberately accept only Stripe's canonical Payment Link
 * host. Legacy page embeds have a wider compatibility contract and continue to
 * use portfolio/paymentEmbed.ts instead.
 */

const MAX_URL_LENGTH = 2048;
const MAX_TRACKING_VALUE_LENGTH = 150;
const MAX_REFERENCE_LENGTH = 200;
const MAX_PROMO_LENGTH = 64;

const STRIPE_LOCALES = new Set([
	'auto',
	'bg',
	'cs',
	'da',
	'de',
	'el',
	'en',
	'en-GB',
	'es',
	'es-419',
	'et',
	'fi',
	'fil',
	'fr',
	'fr-CA',
	'hr',
	'hu',
	'id',
	'it',
	'ja',
	'ko',
	'lt',
	'lv',
	'ms',
	'mt',
	'nb',
	'nl',
	'pl',
	'pt',
	'pt-BR',
	'ro',
	'ru',
	'sk',
	'sl',
	'sv',
	'th',
	'tr',
	'vi',
	'zh',
	'zh-HK',
	'zh-TW',
]);

const TRACKING_PARAMS = new Set([
	'utm_source',
	'utm_content',
	'utm_medium',
	'utm_term',
	'utm_campaign',
]);

export interface ParsedStripePaymentLink {
	/** Canonical, sanitized URL safe to render in a checkout anchor. */
	url: string;
	/** The opaque token in buy.stripe.com/{token}. */
	token: string;
	mode: 'live' | 'test';
}

function validParam(name: string, value: string): boolean {
	if (TRACKING_PARAMS.has(name))
		return value.length <= MAX_TRACKING_VALUE_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
	if (name === 'client_reference_id')
		return value.length <= MAX_REFERENCE_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
	if (name === 'locale') return STRIPE_LOCALES.has(value);
	if (name === 'prefilled_promo_code')
		return value.length <= MAX_PROMO_LENGTH && /^[A-Za-z0-9]+$/.test(value);
	return false;
}

/**
 * Parse and sanitize a Store checkout link.
 *
 * Unknown query parameters (including prefilled buyer details) and fragments are
 * intentionally removed. Each supported parameter is kept at most once.
 */
export function parseStripePaymentLink(raw: string): ParsedStripePaymentLink | null {
	const value = raw.trim();
	if (!value || value.length > MAX_URL_LENGTH) return null;

	let input: URL;
	try {
		input = new URL(value);
	} catch {
		return null;
	}
	if (
		input.protocol !== 'https:' ||
		input.hostname !== 'buy.stripe.com' ||
		input.port ||
		input.username ||
		input.password
	)
		return null;

	const match = /^\/((?:test_)?[A-Za-z0-9]{4,128})\/?$/.exec(input.pathname);
	if (!match) return null;
	const token = match[1];

	const output = new URL(`https://buy.stripe.com/${token}`);
	const seen = new Set<string>();
	for (const [name, paramValue] of input.searchParams) {
		if (seen.has(name) || !validParam(name, paramValue)) continue;
		seen.add(name);
		output.searchParams.set(name, paramValue);
	}

	return {
		url: output.href,
		token,
		mode: token.startsWith('test_') ? 'test' : 'live',
	};
}

/** Canonical Store checkout URL, or null when the value is not an accepted link. */
export function normalizeStripePaymentLink(raw: string): string | null {
	return parseStripePaymentLink(raw)?.url ?? null;
}

/** Whether an otherwise valid Store checkout link points at Stripe test mode. */
export function isTestStripePaymentLink(raw: string): boolean {
	return parseStripePaymentLink(raw)?.mode === 'test';
}
