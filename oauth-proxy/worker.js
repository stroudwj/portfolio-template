// Portfolio editor — GitHub OAuth token-exchange proxy (Cloudflare Worker).
//
// The ONLY server-side piece in this product. It exists for one reason: an OAuth App's
// client secret cannot live in the browser, and GitHub's token endpoint isn't CORS-
// accessible from a page. So the editor sends us the short-lived `code`, we swap it for a
// user access token using the secret, and hand the token back to the editor. No database,
// no per-user state, no logging of tokens.
//
// Routes (all POST):
//   /                 — exchange { code } for an access token
//   /revoke           — revoke { token } on sign-out (DELETE /applications/{client_id}/grant needs
//                       the client secret, so it has to happen here, not in the browser)
//   /subdomain/check  — { token, name }: is name.hangwork.art free to claim?
//   /subdomain/claim  — { token, name }: create the DNS record name.hangwork.art →
//                       {login}.github.io for the GitHub account the token belongs to.
//                       The record's CNAME target doubles as the ownership ledger: a
//                       record pointing at someone else's github.io means "taken", a
//                       record pointing at your own means the claim is idempotent.
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
// The /subdomain routes answer 503 until the last three are set — the editor treats
// that as "no hangwork.art addresses" and publishes to github.io instead.

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

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors(corsOrigin) });
		}
		if (request.method !== 'POST') {
			return json({ error: 'method_not_allowed' }, 405, corsOrigin);
		}
		// Require an Origin in the allowlist — browsers always send Origin on cross-origin
		// fetch, so only the editor passes; requests with a missing or foreign Origin (curl,
		// other sites, server-to-server) are rejected outright. Fail closed if ALLOWED_ORIGIN
		// is unset rather than becoming an open proxy.
		if (!isAllowed) {
			return json({ error: 'forbidden_origin' }, 403, corsOrigin);
		}

		const path = new URL(request.url).pathname;
		if (path === '/revoke') return revoke(request, env, corsOrigin);
		if (path === '/subdomain/check') return subdomain(request, env, corsOrigin, false);
		if (path === '/subdomain/claim') return subdomain(request, env, corsOrigin, true);
		if (path === '/') return exchange(request, env, corsOrigin);
		return json({ error: 'not_found' }, 404, corsOrigin);
	},
};

const CF_API = 'https://api.cloudflare.com/client/v4';

// Subdomains we will never hand out: infrastructure, mail, and anything that could be
// mistaken for the product itself.
const RESERVED_SUBDOMAINS = new Set([
	'www', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'mx',
	'api', 'cdn', 'static', 'assets', 'admin', 'root', 'dev', 'test', 'staging',
	'app', 'editor', 'demo', 'docs', 'help', 'support', 'status', 'blog', 'shop',
	'account', 'accounts', 'login', 'auth', 'pay', 'payments', 'billing', 'hangwork',
]);

/** One DNS label: a–z, 0–9, inner hyphens, ≤63 chars. Mirrors the editor's slugify. */
function isValidSubdomain(name) {
	return typeof name === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) && !RESERVED_SUBDOMAINS.has(name);
}

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

function cors(origin) {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

function json(body, status, origin) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...cors(origin) },
	});
}
