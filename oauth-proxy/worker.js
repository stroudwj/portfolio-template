// Portfolio editor — GitHub OAuth token-exchange proxy (Cloudflare Worker).
//
// The ONLY server-side piece in this product. It exists for one reason: an OAuth App's
// client secret cannot live in the browser, and GitHub's token endpoint isn't CORS-
// accessible from a page. So the editor sends us the short-lived `code`, we swap it for a
// user access token using the secret, and hand the token back to the editor. No database,
// no per-user state, no logging of tokens.
//
// Routes (both POST):
//   /        — exchange { code } for an access token
//   /revoke  — revoke { token } on sign-out (DELETE /applications/{client_id}/grant needs
//              the client secret, so it has to happen here, not in the browser)
//
// Deploy: see README.md in this folder. Required config:
//   - var    GITHUB_CLIENT_ID      (public; the OAuth App's client id)
//   - secret GITHUB_CLIENT_SECRET  (`wrangler secret put GITHUB_CLIENT_SECRET`)
//   - var    ALLOWED_ORIGIN        (e.g. https://stroudwj.github.io) — CORS is locked to this

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export default {
	async fetch(request, env) {
		const origin = request.headers.get('Origin') || '';
		const allowed = env.ALLOWED_ORIGIN || '';
		// Only ever reflect our own editor origin back — never a wildcard, since this
		// endpoint mints credentials.
		const corsOrigin = origin && origin === allowed ? origin : allowed;

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors(corsOrigin) });
		}
		if (request.method !== 'POST') {
			return json({ error: 'method_not_allowed' }, 405, corsOrigin);
		}
		// Require an exact Origin match — browsers always send Origin on cross-origin fetch,
		// so only the editor passes; requests with a missing or foreign Origin (curl, other
		// sites, server-to-server) are rejected outright. Fail closed if ALLOWED_ORIGIN is
		// unset rather than becoming an open proxy.
		if (!allowed || origin !== allowed) {
			return json({ error: 'forbidden_origin' }, 403, corsOrigin);
		}

		const path = new URL(request.url).pathname;
		if (path === '/revoke') return revoke(request, env, corsOrigin);
		if (path === '/') return exchange(request, env, corsOrigin);
		return json({ error: 'not_found' }, 404, corsOrigin);
	},
};

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
