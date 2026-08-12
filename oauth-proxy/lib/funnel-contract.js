// The funnel contract — the ONE definition of the step enum and the attribution-tag
// sanitizer, imported by both halves so they can never drift:
//   - the browser beacon        (src/lib/funnel.ts, product site only)
//   - the Worker ingest + admin (oauth-proxy/funnel.js)
//
// Plain dependency-free ESM so a Cloudflare Worker and Vite can both consume the same
// source file. Types for the TypeScript side live in funnel-contract.d.ts beside it.

/** Funnel order matters: the dashboard computes drop-off between consecutive steps.
 *  Purchases are deliberately NOT a step — the Polar webhook writes them to D1, which
 *  is authoritative and cannot be faked from a browser. */
export const FUNNEL_STEPS = ['landing', 'editor', 'intake', 'signin', 'publish', 'paywall', 'checkout'];

/** Where an untagged visit is counted. Always a column in the dashboard. */
export const DIRECT_REF = 'direct';

/** New refs beyond this many per step in one month fold into `other`, so a junk or
 *  hostile tag generator can't grow one KV value without bound. */
export const FUNNEL_REF_LIMIT = 200;
export const OVERFLOW_REF = 'other';

const REF_MAX_LENGTH = 64;

export function isFunnelStep(value) {
	return typeof value === 'string' && FUNNEL_STEPS.includes(value);
}

/** Same shape as the serving Worker's `page` sanitizer (lowercase, `[a-z0-9/_-]`,
 *  length-capped), plus: edge dashes trimmed and an empty result folded to `direct`,
 *  so junk tags land in one honest bucket instead of inventing columns. */
export function sanitizeFunnelRef(value) {
	if (typeof value !== 'string') return DIRECT_REF;
	const cleaned = value
		.toLowerCase()
		.replace(/[^a-z0-9/_-]+/g, '-')
		.slice(0, REF_MAX_LENGTH)
		.replace(/^[-/]+|[-/]+$/g, '');
	return cleaned || DIRECT_REF;
}

/**
 * The attribution tag for a page load: `?ref=` wins; otherwise `utm_source`, joined
 * with `utm_content` when present (`utm_source/utm_content`). No tag → `direct`.
 * Takes anything with a `.get(name)` (URLSearchParams in the browser and in tests).
 */
export function funnelRefFromParams(params) {
	const direct = params && typeof params.get === 'function' ? params.get('ref') : null;
	if (direct && sanitizeFunnelRef(direct) !== DIRECT_REF) return sanitizeFunnelRef(direct);
	const source = params && typeof params.get === 'function' ? params.get('utm_source') : null;
	if (!source) return DIRECT_REF;
	const content = params.get('utm_content');
	return sanitizeFunnelRef(content ? `${source}/${content}` : source);
}
