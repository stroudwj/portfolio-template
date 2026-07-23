// Hangwork serving Worker — every published portfolio, from R2, via one KV lookup.
// (Direction D, Subsystem 3.)
//
// Request lifecycle:
//   1. Host header → KV `host:{hostname}` → { siteId, status }. KV is a mirror of D1
//      (the source of truth) written by the API Worker on every publish/claim/status
//      change — this hot path never touches D1.
//   2. status !== 'active' → the status page (451 taken down / 429 over quota /
//      503 suspended). The site row IS the kill switch: one write flips it.
//   3. Path → R2 key `{siteId}/…` with GitHub-Pages-style semantics: directory
//      requests serve index.html, extensionless paths redirect to the slashed form,
//      misses fall back to the site's 404.html.
//   4. Stream the object with its stored Content-Type, ETag revalidation and
//      cache headers tuned so Cloudflare's CDN (Cache Rules) absorbs repeat traffic —
//      R2 egress is free, so cost scales with origin hits, not bandwidth.
//
// GETs answer with `Access-Control-Allow-Origin: *`: everything here is public site
// content, and the editor reads a published site cross-origin to re-open it.

const REQUESTS_PER_MONTH = 2_000_000; // per-site origin-hit ceiling (sampled, coarse)
const SAMPLE = 50; // count 1-in-50 requests, weighted back up

function statusPage(title, message) {
	return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;background:#faf8f5;color:#1a1a1a;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;"><div style="max-width:420px;text-align:center;"><h1 style="font-size:20px;font-weight:500;">${title}</h1><p style="font-size:15px;line-height:1.6;color:#555;">${message}</p></div></div>`;
}

function html(body, status, extra = {}) {
	return new Response(body, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
	});
}

/** Sampled per-site origin-hit counter; the ceiling blunts runaway/abusive traffic. */
async function overRequestCeiling(kv, siteId) {
	const period = new Date().toISOString().slice(0, 7); // YYYY-MM
	const key = `reqs:${siteId}:${period}`;
	const count = Number((await kv.get(key)) ?? '0');
	if (count > REQUESTS_PER_MONTH) return true;
	if (Math.random() < 1 / SAMPLE) {
		// Approximate + racy is fine — this is a circuit breaker, not billing.
		await kv.put(key, String(count + SAMPLE), { expirationTtl: 40 * 24 * 60 * 60 });
	}
	return false;
}

export default {
	async fetch(request, env) {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('method not allowed', { status: 405 });
		}

		// On Cloudflare routes (and for-SaaS custom hostnames) the request URL carries the
		// visitor's hostname. `wrangler dev` rewrites it to the route's zone host, so local
		// runs opt into a header override with --var LOCAL_DEV:true — NEVER set in
		// production, where a client-supplied header must not choose whose site we serve
		// (CDN cache poisoning).
		const url = new URL(request.url);
		let hostname = url.hostname.toLowerCase();
		if (env.LOCAL_DEV === 'true') {
			const forwarded = request.headers.get('X-Forwarded-Host') || request.headers.get('Host') || '';
			hostname = forwarded.split(':')[0].toLowerCase() || hostname;
		}

		// The wildcard route (*.hangwork.art) also catches www — canonicalize any `www.`
		// host to its bare apex with a 301, so www.hangwork.art keeps landing on the
		// marketing site (served at the apex) instead of the "no site here" page. `www`
		// is a reserved subdomain, so it can never be a real user site. This also
		// canonicalizes www on connected custom domains, which is conventional.
		if (hostname.startsWith('www.')) {
			return Response.redirect(`https://${hostname.slice(4)}${url.pathname}${url.search}`, 301);
		}

		const route = hostname ? await env.KV.get(`host:${hostname}`, 'json') : null;
		if (!route?.siteId) {
			return html(statusPage('No site here', 'There is no published site at this address.'), 404);
		}

		// The enforcement surface: one D1/KV write (status) turns any of these on.
		if (route.status === 'taken_down' || route.status === 'suspended') {
			const taken = route.status === 'taken_down';
			return html(
				statusPage(
					taken ? 'Site unavailable' : 'Site paused',
					taken
						? 'This site has been taken down for a policy or legal reason.'
						: 'This site is temporarily paused. Please check back later.',
				),
				taken ? 451 : 503,
			);
		}
		if (route.status === 'over_quota' || (await overRequestCeiling(env.KV, route.siteId))) {
			return html(statusPage('Too much traffic', 'This site is over its usage limit right now. Please try again later.'), 429, {
				'Retry-After': '3600',
			});
		}

		let path;
		try {
			path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
		} catch {
			return html(statusPage('Bad request', 'That address could not be read.'), 400);
		}
		if (path.includes('..') || path.includes('\\')) {
			return html(statusPage('Bad request', 'That address could not be read.'), 400);
		}

		const key = (rest) => `${route.siteId}/${rest}`;
		let object = null;
		if (path === '' || path.endsWith('/')) {
			object = await env.SITES.get(key(`${path}index.html`));
		} else {
			object = await env.SITES.get(key(path));
			// GitHub-Pages semantics: /about → /about/ when about/index.html exists.
			if (!object && !path.split('/').pop().includes('.')) {
				const dirIndex = await env.SITES.head(key(`${path}/index.html`));
				if (dirIndex) {
					return Response.redirect(`${url.origin}/${path}/${url.search}`, 301);
				}
			}
		}

		if (!object) {
			const notFound = await env.SITES.get(key('404.html'));
			if (notFound) {
				return new Response(notFound.body, {
					status: 404,
					headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
				});
			}
			return html(statusPage('Not found', 'That page does not exist on this site.'), 404);
		}

		// ETag revalidation keeps repeat visits (and the CDN) cheap.
		const etag = object.httpEtag;
		if (etag && request.headers.get('If-None-Match') === etag) {
			return new Response(null, { status: 304, headers: { ETag: etag } });
		}

		const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
		const isHtml = contentType.startsWith('text/html');
		const headers = {
			'Content-Type': contentType,
			ETag: etag,
			// HTML revalidates fast so republished pages appear promptly; media can rest
			// longer — a republish rewrites bytes under the same name, and the shorter
			// HTML TTL is what actually swaps a page's references.
			'Cache-Control': isHtml ? 'public, max-age=60, must-revalidate' : 'public, max-age=3600',
			'Access-Control-Allow-Origin': '*',
			'X-Content-Type-Options': 'nosniff',
		};
		if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
		return new Response(object.body, { status: 200, headers });
	},
};
