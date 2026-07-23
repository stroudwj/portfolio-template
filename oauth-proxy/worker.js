// Hangwork API Worker — accounts, publishing, site management, plus the original
// GitHub OAuth token-exchange proxy (kept for the optional GitHub mirror).
//
// Modules: auth.js (accounts/licenses), publish.js (R2 publishing), site.js
// (subdomains/custom hostnames/export). This file owns routing + the fail-closed
// CORS gate. The serving Worker for *.hangwork.art lives in ../site-server/.
//
// Routes:
//   POST /auth/magic/start            — email a single-use sign-in link
//   POST /auth/magic/verify           — sign-in link token → session JWT
//   POST /auth/google                 — Google OAuth code → session JWT
//   POST /auth/session                — validate session, return account summary
//   POST /auth/license/bind           — attach a Lemon Squeezy key to the account
//   POST /webhooks/lemonsqueezy       — signed LS webhook (no CORS gate; signature auth)
//   POST /publish                     — authz + quota + manifest diff → upload tickets
//   PUT  /upload?ticket=…             — one file's bytes into R2 (hash-verified)
//   POST /publish/complete            — apply deletions, update D1/KV, answer live URL
//   POST /site/subdomain/check|claim  — [name].hangwork.art via D1/KV (no per-user DNS)
//   POST /site/custom-hostname[/status|/remove] — Cloudflare-for-SaaS custom domains
//   POST /site/status                 — owner takes the site offline / under construction / live
//   POST /site/delete                 — permanently erase the site (R2 + hostnames + rows)
//   GET  /site/export                 — zip of the published site (ownership guarantee)
//
// Legacy GitHub routes (all POST, kept only for the optional mirror flow):
//   /                 — exchange { code } for an access token
//   /revoke           — revoke { token } on sign-out (DELETE /applications/{client_id}/grant needs
//                       the client secret, so it has to happen here, not in the browser)
//   /subdomain/check  — { token, name }: is name.hangwork.art free to claim? (DNS-ledger flavor)
//   /subdomain/claim  — { token, name }: create the DNS record name.hangwork.art →
//                       {login}.github.io for the GitHub account the token belongs to.
//   /handoff          — email the sender's editor link ("open this on your computer").
//                       { license_key }: validate the key with Lemon Squeezy, then send
//                       the post-purchase email to the BUYER's address (from the key —
//                       never a caller-supplied address), with an auto-unlock link.
//                       { email }: send the plain continue-on-desktop link to that
//                       address. Content is fixed server-side; the caller controls only
//                       the recipient (unpaid) or nothing at all (paid).
//
// Deploy: see README.md in this folder. Required config:
//   - var    GITHUB_CLIENT_ID      (public; the OAuth App's client id)
//   - secret GITHUB_CLIENT_SECRET  (`wrangler secret put GITHUB_CLIENT_SECRET`)
//   - var    ALLOWED_ORIGIN        CORS is locked to this. One origin, or a comma-separated
//                                  list (e.g. "https://hangwork.art,https://portfolio-template-9p2.pages.dev")
//                                  to allow the custom domain and the pages.dev fallback at once.
//   - var    SITES_ROOT_DOMAIN     the domain subdomains are granted under ("hangwork.art")
//   - var    CF_ZONE_ID            the Cloudflare zone id of SITES_ROOT_DOMAIN
//   - secret CF_DNS_TOKEN          a Cloudflare API token with DNS:Edit on that zone
//                                  (`wrangler secret put CF_DNS_TOKEN`)
//   - secret RESEND_API_KEY        Resend API key for /handoff (`wrangler secret put RESEND_API_KEY`)
//   - var    EMAIL_FROM            the /handoff sender, e.g. "Hangwork <hello@hangwork.art>"
//                                  (the domain must be verified in Resend)
//   - var    LS_STORE_ID           Lemon Squeezy store + product ids — /handoff only mails
//   - var    LS_PRODUCT_ID         buyers of THIS product (mirror src/editor/lib/license/config.ts)
// The /subdomain routes answer 503 until their config is set — the editor treats
// that as "no hangwork.art addresses" and publishes to github.io instead. /handoff
// answers 503 the same way until RESEND_API_KEY + EMAIL_FROM are set; the editor
// then falls back to showing a copy-the-link flow instead of sending email.

import { cors, json, isEmailAddress } from './lib/http.js';
import { emailHtml, sendEmail } from './lib/email.js';
import { magicStart, magicVerify, google, session, licenseBind, lsWebhook } from './auth.js';
import { publish, upload, publishComplete } from './publish.js';
import {
	subdomainCheck,
	subdomainClaim,
	customHostnameCreate,
	customHostnameStatus,
	customHostnameRemove,
	siteStatusSet,
	siteDelete,
	exportSite,
	isValidSubdomain,
} from './site.js';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export default {
	async fetch(request, env) {
		const origin = request.headers.get('Origin') || '';
		// ALLOWED_ORIGIN may list several origins (comma-separated) so a custom domain and
		// the pages.dev fallback both pass during/after a domain switch.
		const allowlist = (env.ALLOWED_ORIGIN || '')
			.split(',')
			.map((o) => o.trim())
			.filter(Boolean);
		const isAllowed = origin !== '' && allowlist.includes(origin);
		// Only ever reflect a known editor origin back — never a wildcard, since this
		// endpoint mints credentials. Non-matches get the first configured origin (used only
		// on the error response, which the browser discards anyway).
		const corsOrigin = isAllowed ? origin : allowlist[0] || '';
		const path = new URL(request.url).pathname;

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors(corsOrigin) });
		}

		// Server-to-server webhooks carry no Origin — they authenticate with the signing
		// secret instead of the CORS gate. Everything else stays origin-locked.
		if (path === '/webhooks/lemonsqueezy' && request.method === 'POST') {
			return lsWebhook(request, env);
		}

		// Require an Origin in the allowlist — browsers always send Origin on cross-origin
		// fetch, so only the editor passes; requests with a missing or foreign Origin (curl,
		// other sites, server-to-server) are rejected outright. Fail closed if ALLOWED_ORIGIN
		// is unset rather than becoming an open proxy.
		if (!isAllowed) {
			return json({ error: 'forbidden_origin' }, 403, corsOrigin);
		}

		if (request.method === 'PUT') {
			if (path === '/upload') return upload(request, env, corsOrigin);
			return json({ error: 'method_not_allowed' }, 405, corsOrigin);
		}
		if (request.method === 'GET') {
			if (path === '/site/export') return exportSite(request, env, corsOrigin);
			return json({ error: 'method_not_allowed' }, 405, corsOrigin);
		}
		if (request.method !== 'POST') {
			return json({ error: 'method_not_allowed' }, 405, corsOrigin);
		}

		// Accounts + hosting (Direction D).
		if (path === '/auth/magic/start') return magicStart(request, env, corsOrigin, origin);
		if (path === '/auth/magic/verify') return magicVerify(request, env, corsOrigin);
		if (path === '/auth/google') return google(request, env, corsOrigin);
		if (path === '/auth/session') return session(request, env, corsOrigin);
		if (path === '/auth/license/bind') return licenseBind(request, env, corsOrigin);
		if (path === '/publish') return publish(request, env, corsOrigin);
		if (path === '/publish/complete') return publishComplete(request, env, corsOrigin);
		if (path === '/site/subdomain/check') return subdomainCheck(request, env, corsOrigin);
		if (path === '/site/subdomain/claim') return subdomainClaim(request, env, corsOrigin);
		if (path === '/site/custom-hostname') return customHostnameCreate(request, env, corsOrigin);
		if (path === '/site/custom-hostname/status') return customHostnameStatus(request, env, corsOrigin);
		if (path === '/site/custom-hostname/remove') return customHostnameRemove(request, env, corsOrigin);
		if (path === '/site/status') return siteStatusSet(request, env, corsOrigin);
		if (path === '/site/delete') return siteDelete(request, env, corsOrigin);

		// Legacy GitHub flow (optional mirror).
		if (path === '/revoke') return revoke(request, env, corsOrigin);
		if (path === '/subdomain/check') return subdomain(request, env, corsOrigin, false);
		if (path === '/subdomain/claim') return subdomain(request, env, corsOrigin, true);
		if (path === '/handoff') return handoff(request, env, corsOrigin, origin);
		if (path === '/') return exchange(request, env, corsOrigin);
		return json({ error: 'not_found' }, 404, corsOrigin);
	},
};

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * Grant (or probe) a hangwork.art subdomain. The caller proves who they are with their
 * GitHub token; the record we create can ONLY point at that account's github.io, so the
 * worker can never be used to alias arbitrary hosts, and a name already pointing at a
 * different account is simply "taken".
 */
async function subdomain(request, env, corsOrigin, claim) {
	if (!env.SITES_ROOT_DOMAIN || !env.CF_ZONE_ID || !env.CF_DNS_TOKEN) {
		return json({ error: 'subdomains_unconfigured' }, 503, corsOrigin);
	}

	let token, name;
	try {
		({ token, name } = await request.json());
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	if (!token || typeof token !== 'string') return json({ error: 'missing_token' }, 400, corsOrigin);
	if (!isValidSubdomain(name)) return json({ error: 'invalid_name' }, 400, corsOrigin);

	// Who is asking? The GitHub login pins the only CNAME target we'll ever write.
	let login;
	try {
		const res = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'portfolio-oauth-proxy',
			},
		});
		if (!res.ok) return json({ error: 'invalid_token' }, 401, corsOrigin);
		login = (await res.json()).login;
	} catch {
		return json({ error: 'github_unreachable' }, 502, corsOrigin);
	}
	if (!login || !/^[a-zA-Z0-9-]+$/.test(login)) return json({ error: 'invalid_token' }, 401, corsOrigin);

	const fqdn = `${name}.${env.SITES_ROOT_DOMAIN}`;
	const target = `${login.toLowerCase()}.github.io`;
	const cfHeaders = { Authorization: `Bearer ${env.CF_DNS_TOKEN}`, 'Content-Type': 'application/json' };

	// Any existing record on the name (regardless of type) decides availability.
	let existing;
	try {
		const res = await fetch(`${CF_API}/zones/${env.CF_ZONE_ID}/dns_records?name=${fqdn}`, { headers: cfHeaders });
		const data = await res.json();
		if (!res.ok || !data.success) return json({ error: 'dns_lookup_failed' }, 502, corsOrigin);
		existing = data.result?.[0] ?? null;
	} catch {
		return json({ error: 'dns_unreachable' }, 502, corsOrigin);
	}

	const ours = existing && existing.type === 'CNAME' && existing.content?.toLowerCase() === target;
	if (existing && !ours) {
		return json({ error: 'name_taken', domain: fqdn }, 409, corsOrigin);
	}
	if (!claim) {
		return json({ available: existing === null || ours, domain: fqdn }, 200, corsOrigin);
	}
	if (ours) {
		return json({ domain: fqdn }, 200, corsOrigin); // re-publish of the same site
	}

	// DNS-only (not proxied): GitHub must see the CNAME directly to route the domain
	// and issue its HTTPS certificate.
	try {
		const res = await fetch(`${CF_API}/zones/${env.CF_ZONE_ID}/dns_records`, {
			method: 'POST',
			headers: cfHeaders,
			body: JSON.stringify({
				type: 'CNAME',
				name: fqdn,
				content: target,
				ttl: 1,
				proxied: false,
				comment: `hangwork site for github:${login}`,
			}),
		});
		const data = await res.json();
		if (!res.ok || !data.success) return json({ error: 'dns_create_failed' }, 502, corsOrigin);
	} catch {
		return json({ error: 'dns_unreachable' }, 502, corsOrigin);
	}
	return json({ domain: fqdn }, 200, corsOrigin);
}

// --- /handoff — "send me the link" emails -----------------------------------
//
// Phones can browse and buy but not build, so the editor offers to email the
// person their own editor link to open on a computer. Two modes:
//   { license_key } — a buyer. The key is validated with Lemon Squeezy and the
//                     mail goes to the ADDRESS ON THE PURCHASE, carrying an
//                     auto-unlock link (?license_key=…). The caller cannot pick
//                     the recipient, so a key can only ever mail its own buyer.
//   { email }       — not (yet) a buyer. A plain editor link goes to the given
//                     address. Subject and body are fixed here, so the worst
//                     abuse of this endpoint is repeating the same short mail —
//                     dampened by the per-isolate rate limit below (add a
//                     Cloudflare rate-limiting rule on /handoff for real volume).

const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const HANDOFF_WINDOW_MS = 10 * 60 * 1000;
const HANDOFF_MAX_PER_WINDOW = 4;

// Best-effort flood damper. Workers isolates are ephemeral and per-PoP, so this
// is not a guarantee — it exists to blunt naive loops, not determined abuse.
const handoffLog = new Map();

function handoffRateLimited(ip) {
	const now = Date.now();
	if (handoffLog.size > 500) {
		for (const [key, times] of handoffLog) {
			if (times.every((t) => now - t > HANDOFF_WINDOW_MS)) handoffLog.delete(key);
		}
	}
	const times = (handoffLog.get(ip) || []).filter((t) => now - t <= HANDOFF_WINDOW_MS);
	if (times.length >= HANDOFF_MAX_PER_WINDOW) return true;
	times.push(now);
	handoffLog.set(ip, times);
	return false;
}

/** The email for someone who hasn't bought yet: just the way back to the canvas. */
function handoffEmail(link) {
	return {
		subject: 'Your Hangwork link',
		text: `The canvas is waiting.\n\nOpen this on your computer and you'll pick up right where you left off:\n\n${link}\n\nWhenever you're ready to hang your first piece.`,
		html: emailHtml(
			['The canvas is waiting.', 'Open this on your computer and you’ll pick up right where you left off.'],
			'Open Hangwork on your computer',
			link,
			['Whenever you’re ready to hang your first piece.'],
		),
	};
}

/** The post-purchase email: reassurance first, then the desktop link. */
function postPurchaseEmail(link) {
	return {
		subject: 'You own Hangwork now',
		text: `You own Hangwork — that's yours to keep.\n\nNothing's lost and nothing needs redoing. When you're at a computer, open the link below and the canvas will be waiting. No rush.\n\n${link}\n\nWhenever you're ready to hang your first piece.`,
		html: emailHtml(
			[
				'You own Hangwork — that’s yours to keep.',
				'Nothing’s lost and nothing needs redoing. When you’re at a computer, open the link below and the canvas will be waiting. No rush.',
			],
			'Open Hangwork on your computer',
			link,
			['Whenever you’re ready to hang your first piece.'],
		),
	};
}

async function handoff(request, env, corsOrigin, origin) {
	if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
		return json({ error: 'email_unconfigured' }, 503, corsOrigin);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}

	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	if (handoffRateLimited(ip)) {
		return json({ error: 'rate_limited' }, 429, corsOrigin);
	}

	// The link always points at the origin the request came from (already checked
	// against ALLOWED_ORIGIN), so this endpoint can never mail a foreign address bar.
	const editorLink = origin + (env.EDITOR_PATH || '/editor/');

	let to;
	let mail;
	if (typeof body.license_key === 'string' && body.license_key.trim()) {
		// Paid mode: the key decides the recipient. Validate it with Lemon Squeezy
		// and confirm it belongs to THIS product before mailing anyone.
		const key = body.license_key.trim();
		if (key.length > 64) return json({ error: 'invalid_license' }, 400, corsOrigin);
		let data;
		try {
			const res = await fetch(LS_VALIDATE_URL, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ license_key: key }).toString(),
			});
			data = await res.json();
		} catch {
			return json({ error: 'license_service_unreachable' }, 502, corsOrigin);
		}
		// "inactive" just means not yet activated on a device — still a real purchase.
		// Disabled/expired keys (refunds) get no mail.
		const status = data?.license_key?.status;
		const meta = data?.meta;
		const belongsHere =
			meta &&
			(!env.LS_STORE_ID || meta.store_id === Number(env.LS_STORE_ID)) &&
			(!env.LS_PRODUCT_ID || meta.product_id === Number(env.LS_PRODUCT_ID));
		if (!(status === 'active' || status === 'inactive') || !belongsHere || !isEmailAddress(meta.customer_email)) {
			return json({ error: 'invalid_license' }, 400, corsOrigin);
		}
		to = meta.customer_email.trim();
		mail = postPurchaseEmail(`${editorLink}?license_key=${encodeURIComponent(key)}`);
	} else if (isEmailAddress(body.email)) {
		to = body.email.trim();
		mail = handoffEmail(editorLink);
	} else {
		return json({ error: 'missing_email' }, 400, corsOrigin);
	}

	if (!(await sendEmail(env, to, mail))) {
		return json({ error: 'email_send_failed' }, 502, corsOrigin);
	}
	// Echo the recipient so the editor can show "Sent to …" (it's the caller's own
	// address, or the buyer's own — the license key already proves purchase).
	return json({ sent: true, email: to }, 200, corsOrigin);
}

/** Swap a GitHub OAuth `code` for a user access token. */
async function exchange(request, env, corsOrigin) {
	let code;
	try {
		({ code } = await request.json());
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	if (!code || typeof code !== 'string') {
		return json({ error: 'missing_code' }, 400, corsOrigin);
	}

	// Exchange the code for a user access token.
	let ghData;
	try {
		const res = await fetch(GITHUB_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({
				client_id: env.GITHUB_CLIENT_ID,
				client_secret: env.GITHUB_CLIENT_SECRET,
				code,
			}),
		});
		ghData = await res.json();
	} catch {
		return json({ error: 'github_unreachable' }, 502, corsOrigin);
	}

	// GitHub returns 200 with an `error` field on bad/expired codes.
	if (ghData.error || !ghData.access_token) {
		return json({ error: ghData.error || 'no_token', error_description: ghData.error_description }, 400, corsOrigin);
	}

	// Hand back only the token + scope. The secret never leaves this Worker.
	return json({ access_token: ghData.access_token, scope: ghData.scope, token_type: ghData.token_type }, 200, corsOrigin);
}

/** Revoke the app's entire OAuth grant on GitHub (sign-out). Deleting the GRANT (not just
 *  this one token) invalidates all of the app's tokens for that user and removes the app
 *  from their "Authorized OAuth Apps" list — a clean, complete disconnect; reconnecting
 *  shows GitHub's consent screen again. Best-effort: a 404 just means the token wasn't
 *  minted by this app (e.g. a pasted PAT) or the grant was already revoked. */
async function revoke(request, env, corsOrigin) {
	let token;
	try {
		({ token } = await request.json());
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	if (!token || typeof token !== 'string') {
		return json({ error: 'missing_token' }, 400, corsOrigin);
	}

	try {
		const res = await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/grant`, {
			method: 'DELETE',
			headers: {
				Authorization: 'Basic ' + btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`),
				Accept: 'application/vnd.github+json',
				'User-Agent': 'portfolio-oauth-proxy',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ access_token: token }),
		});
		// 204 = revoked; 404 = not this app's token / already gone. Both fine for sign-out.
		if (res.status === 204 || res.status === 404) {
			return new Response(null, { status: 204, headers: cors(corsOrigin) });
		}
		return json({ error: 'revoke_failed' }, 502, corsOrigin);
	} catch {
		return json({ error: 'github_unreachable' }, 502, corsOrigin);
	}
}
