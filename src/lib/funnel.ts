// First-party funnel analytics for hangwork.art — how many visitors reach each step of
// the funnel, and which link sent them. Counts only: no cookies, no identity, no IP, no
// user agent, no referrer, nothing about the person. The mirror image of the per-artist
// site beacon in src/portfolio/Analytics.tsx, pointed at the API Worker instead.
//
// Three rules this file exists to enforce:
//   1. Product site only. Published artist sites and the portfolio runtime never carry
//      it — IS_PRODUCT_SITE is checked before anything is read or sent.
//   2. Once per step per tab session, so a re-render or a remount can't inflate a count.
//      These are funnel reaches, not page views.
//   3. Analytics must never break the page: every path is wrapped and swallowed.
import { ACCOUNT_API_URL } from '../editor/lib/account/config';
import { IS_PRODUCT_SITE } from './productSite';
import {
	DIRECT_REF,
	funnelRefFromParams,
	isFunnelStep,
	type FunnelStep,
} from '../../oauth-proxy/lib/funnel-contract.js';

export type { FunnelStep };

const REF_KEY = 'hangwork:funnel-ref';
const SENT_PREFIX = 'hangwork:funnel-sent:';

/** The bits of the browser the beacon touches, injected so the logic is testable
 *  without a DOM and swappable in the once-per-session tests. */
export interface FunnelEnvironment {
	/** sessionStorage, or null in private modes where it throws. */
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
	/** `window.location.search` of the current page load. */
	search: string;
	/** Fire-and-forget transport for one JSON payload. */
	send(body: string): void;
}

function read(storage: FunnelEnvironment['storage'], key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function write(storage: FunnelEnvironment['storage'], key: string, value: string): void {
	try {
		storage?.setItem(key, value);
	} catch {
		/* private mode — attribution degrades to `direct`, the page is unaffected. */
	}
}

/**
 * The attribution tag for this tab: read from the URL on the first load that carries
 * one, then sticky in sessionStorage so every later step in the same tab is credited to
 * the same UGC post. No tag anywhere → `direct`.
 */
export function funnelRefFor(environment: FunnelEnvironment): string {
	const stored = read(environment.storage, REF_KEY);
	if (stored) return stored;
	const fromUrl = funnelRefFromParams(new URLSearchParams(environment.search));
	if (fromUrl !== DIRECT_REF) write(environment.storage, REF_KEY, fromUrl);
	return fromUrl;
}

/**
 * The testable core: record one funnel step in this environment. Returns whether the
 * event was actually sent (false = unknown step, or already counted this session).
 */
export function reportFunnelStep(step: FunnelStep, environment: FunnelEnvironment): boolean {
	if (!isFunnelStep(step)) return false;
	const guard = SENT_PREFIX + step;
	if (read(environment.storage, guard) === '1') return false;
	write(environment.storage, guard, '1');
	environment.send(JSON.stringify({ step, ref: funnelRefFor(environment) }));
	return true;
}

function browserEnvironment(): FunnelEnvironment {
	let storage: FunnelEnvironment['storage'] = null;
	try {
		storage = window.sessionStorage;
	} catch {
		/* Safari private mode throws on access, not just on write. */
	}
	return {
		storage,
		search: window.location.search,
		send(body) {
			const url = `${ACCOUNT_API_URL}/funnel/event`;
			// text/plain deliberately: it is CORS-safelisted, so this cross-origin beacon
			// needs no preflight. sendBeacon always sends credentials mode "include", and
			// a preflight would then demand Access-Control-Allow-Credentials, which the
			// Worker's shared CORS helper does not (and should not) send. The Worker parses
			// the body itself, so the declared type costs nothing. Verified in-browser.
			if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
			void fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				keepalive: true,
			}).catch(() => {
				/* offline, blocked, or the Worker is down — never surfaced. */
			});
		},
	};
}

/** Count one funnel step. Safe to call from anywhere, any number of times. */
export function funnelStep(step: FunnelStep): void {
	if (!IS_PRODUCT_SITE || typeof window === 'undefined') return;
	try {
		reportFunnelStep(step, browserEnvironment());
	} catch {
		/* Analytics must never interfere with the product itself. */
	}
}
