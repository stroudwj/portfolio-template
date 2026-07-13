// Portfolio editor — GitHub OAuth token-exchange proxy (Cloudflare Worker).
//
// The ONLY server-side piece in this product. It exists for one reason: an OAuth App's
// client secret cannot live in the browser, and GitHub's token endpoint isn't CORS-
// accessible from a page. So the editor sends us the short-lived `code`, we swap it for a
// user access token using the secret, and hand the token back to the editor. No database,
// no per-user state, no logging of tokens.
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
		// Reject cross-site callers outright (defense in depth alongside CORS, which only
		// protects browsers).
		if (origin && allowed && origin !== allowed) {
			return json({ error: 'forbidden_origin' }, 403, corsOrigin);
		}

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
	},
};

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
