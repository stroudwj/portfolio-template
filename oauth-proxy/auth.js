// Hangwork accounts — passwordless auth + license binding (Direction D, Subsystem 1).
//
// Routes (wired in worker.js):
//   POST /auth/magic/start   { email }        → email a single-use sign-in link (Resend)
//   POST /auth/magic/verify  { token }        → nonce → session JWT + account summary
//   POST /auth/google        { code, redirect_uri } → Google code → session JWT + summary
//   POST /auth/session       (Bearer)         → validate JWT, return account summary
//   POST /auth/license/bind  { license_key } (Bearer) → validate with LS, attach to user
//   POST /webhooks/lemonsqueezy               → signed webhook; the robust license ledger
//
// The session is a stateless 30-day HS256 JWT signed with SESSION_SECRET. Sign-out is
// client-side (drop the token) — nothing server-side to revoke, and the license/site
// gates are re-checked in D1 on every publish anyway.

import { signJwt, verifyJwt, decodeJwtPayload, bearerToken } from './lib/jwt.js';
import { json, readJson, isEmailAddress } from './lib/http.js';
import { emailHtml, sendEmail } from './lib/email.js';
import { upsertUserByEmail, getUser, accountSummary, newId } from './lib/db.js';

const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const MAGIC_TTL_S = 15 * 60; // sign-in link validity
const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

async function issueSession(env, user) {
	const now = Math.floor(Date.now() / 1000);
	return signJwt({ sub: user.id, email: user.email, iat: now, exp: now + SESSION_TTL_S }, env.SESSION_SECRET);
}

/** Resolve the Bearer session to a user row, or null. */
export async function sessionUser(request, env) {
	if (!env.SESSION_SECRET) return null;
	const token = bearerToken(request);
	if (!token) return null;
	const claims = await verifyJwt(token, env.SESSION_SECRET);
	if (!claims?.sub) return null;
	return await getUser(env.DB, claims.sub);
}

// ---- magic link ------------------------------------------------------------

function magicEmail(link) {
	return {
		subject: 'Sign in to Hangwork',
		text: `Here's your sign-in link:\n\n${link}\n\nIt works once and expires in 15 minutes. If you didn't request it, you can ignore this email.`,
		html: emailHtml(
			['Here’s your sign-in link.'],
			'Sign in to Hangwork',
			link,
			['It works once and expires in 15 minutes. If you didn’t request it, you can ignore this email.'],
		),
	};
}

export async function magicStart(request, env, corsOrigin, origin) {
	if (!env.SESSION_SECRET || !env.DB || !env.KV) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: 'email_unconfigured' }, 503, corsOrigin);

	const body = await readJson(request);
	if (!body || !isEmailAddress(body.email)) return json({ error: 'missing_email' }, 400, corsOrigin);
	const email = body.email.trim().toLowerCase();

	// One link per address per minute — keeps the endpoint from being an email cannon.
	const cooldownKey = `magic-cooldown:${email}`;
	if (await env.KV.get(cooldownKey)) return json({ error: 'rate_limited' }, 429, corsOrigin);
	await env.KV.put(cooldownKey, '1', { expirationTtl: 60 });

	// Single-use nonce, held only in KV (with expiry) — the emailed link carries it.
	const nonce = newId() + newId();
	await env.KV.put(`magic:${nonce}`, JSON.stringify({ email }), { expirationTtl: MAGIC_TTL_S });

	// The link always points at the origin the request came from (already allowlisted),
	// so this endpoint can never mail a foreign address bar. Mirrors /handoff.
	const link = `${origin}${env.EDITOR_PATH || '/editor/'}?magic_token=${nonce}`;
	if (!(await sendEmail(env, email, magicEmail(link)))) {
		return json({ error: 'email_send_failed' }, 502, corsOrigin);
	}
	return json({ sent: true, email }, 200, corsOrigin);
}

export async function magicVerify(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB || !env.KV) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const body = await readJson(request);
	const nonce = typeof body?.token === 'string' ? body.token.trim() : '';
	if (!nonce || nonce.length > 128) return json({ error: 'invalid_token' }, 400, corsOrigin);

	const key = `magic:${nonce}`;
	const stored = await env.KV.get(key, 'json');
	if (!stored?.email) return json({ error: 'expired_token' }, 401, corsOrigin);
	await env.KV.delete(key); // single-use

	const user = await upsertUserByEmail(env.DB, stored.email);
	const summary = await accountSummary(env.DB, user);
	return json({ token: await issueSession(env, user), ...summary }, 200, corsOrigin);
}

// ---- Google OAuth ----------------------------------------------------------

export async function google(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'google_unconfigured' }, 503, corsOrigin);

	const body = await readJson(request);
	const code = typeof body?.code === 'string' ? body.code : '';
	const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
	if (!code || !redirectUri) return json({ error: 'missing_code' }, 400, corsOrigin);

	let data;
	try {
		const res = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: env.GOOGLE_CLIENT_ID,
				client_secret: env.GOOGLE_CLIENT_SECRET,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code',
			}).toString(),
		});
		data = await res.json();
	} catch {
		return json({ error: 'google_unreachable' }, 502, corsOrigin);
	}
	if (!data?.id_token) return json({ error: data?.error || 'no_token' }, 400, corsOrigin);

	// The id_token came straight from Google's token endpoint over TLS, so decoding
	// without signature verification is sound — but the audience and verified-email
	// checks still matter (a token minted for another app must not sign in here).
	const claims = decodeJwtPayload(data.id_token);
	if (!claims || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.email || claims.email_verified === false) {
		return json({ error: 'invalid_google_token' }, 401, corsOrigin);
	}

	const user = await upsertUserByEmail(env.DB, claims.email, claims.sub || null);
	const summary = await accountSummary(env.DB, user);
	return json({ token: await issueSession(env, user), ...summary }, 200, corsOrigin);
}

// ---- session ---------------------------------------------------------------

export async function session(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);
	return json(await accountSummary(env.DB, user), 200, corsOrigin);
}

// ---- license binding (editor redirect path) --------------------------------

export async function licenseBind(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);

	const body = await readJson(request);
	const key = typeof body?.license_key === 'string' ? body.license_key.trim() : '';
	if (!key || key.length > 64) return json({ error: 'invalid_license' }, 400, corsOrigin);

	// Validate with Lemon Squeezy and confirm the key is for THIS product — the same
	// server-side check /handoff performs (the browser's product check moved here).
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
	// "inactive" = not activated on a device yet — still a real purchase.
	const status = data?.license_key?.status;
	const meta = data?.meta;
	const belongsHere =
		meta &&
		(!env.LS_STORE_ID || meta.store_id === Number(env.LS_STORE_ID)) &&
		(!env.LS_PRODUCT_ID || meta.product_id === Number(env.LS_PRODUCT_ID));
	if (!(status === 'active' || status === 'inactive') || !belongsHere) {
		return json({ error: 'invalid_license' }, 400, corsOrigin);
	}

	// Upsert by key: the webhook may already have recorded it (possibly unattached).
	const existing = await env.DB.prepare('SELECT * FROM licenses WHERE ls_license_key = ?').bind(key).first();
	if (existing) {
		if (existing.user_id && existing.user_id !== user.id) return json({ error: 'license_in_use' }, 409, corsOrigin);
		await env.DB.prepare("UPDATE licenses SET user_id = ?, status = 'active', activated_at = COALESCE(activated_at, ?) WHERE id = ?")
			.bind(user.id, new Date().toISOString(), existing.id)
			.run();
	} else {
		await env.DB.prepare(
			'INSERT INTO licenses (id, user_id, ls_license_key, ls_order_id, buyer_email, status, activated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		)
			.bind(newId(), user.id, key, meta.order_id ? String(meta.order_id) : null, meta.customer_email || null, 'active', new Date().toISOString())
			.run();
	}
	return json(await accountSummary(env.DB, user), 200, corsOrigin);
}

// ---- Lemon Squeezy webhook (the robust source of truth) --------------------

async function hmacHex(secret, bodyText) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyText));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** No CORS/origin gate — Lemon Squeezy's servers call this. Auth = the signing secret. */
export async function lsWebhook(request, env) {
	if (!env.LS_WEBHOOK_SECRET || !env.DB) return new Response('unconfigured', { status: 503 });
	const bodyText = await request.text();
	const signature = request.headers.get('X-Signature') || '';
	const expected = await hmacHex(env.LS_WEBHOOK_SECRET, bodyText);
	if (!signature || !timingSafeEqual(signature.toLowerCase(), expected)) {
		return new Response('invalid signature', { status: 401 });
	}

	let payload;
	try {
		payload = JSON.parse(bodyText);
	} catch {
		return new Response('invalid json', { status: 400 });
	}
	const event = payload?.meta?.event_name;
	const attrs = payload?.data?.attributes ?? {};

	if (event === 'order_created') {
		// Only orders for THIS product create entitlements.
		const productId = attrs.first_order_item?.product_id;
		if (env.LS_PRODUCT_ID && productId !== Number(env.LS_PRODUCT_ID)) return new Response('ignored', { status: 200 });
		if (attrs.status && attrs.status !== 'paid') return new Response('ignored', { status: 200 });
		const orderId = String(payload.data.id);
		const email = typeof attrs.user_email === 'string' ? attrs.user_email.trim().toLowerCase() : null;
		if (!email) return new Response('ignored', { status: 200 });
		// Attach immediately when the buyer already has an account; else leave user_id
		// NULL — accountSummary() adopts it by email on their next sign-in.
		const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
		await env.DB.prepare(
			'INSERT INTO licenses (id, user_id, ls_order_id, buyer_email, status) VALUES (?, ?, ?, ?, ?) ' +
				"ON CONFLICT(ls_order_id) DO UPDATE SET status = 'active', buyer_email = excluded.buyer_email",
		)
			.bind(newId(), user?.id ?? null, orderId, email, 'active')
			.run();
		return new Response('ok', { status: 200 });
	}

	if (event === 'license_key_created') {
		// Record the actual key against the order's license row (creates it if the
		// order_created event was missed).
		const orderId = attrs.order_id != null ? String(attrs.order_id) : null;
		const key = typeof attrs.key === 'string' ? attrs.key : null;
		if (!key) return new Response('ignored', { status: 200 });
		const email = typeof attrs.user_email === 'string' ? attrs.user_email.trim().toLowerCase() : null;
		const row = orderId
			? await env.DB.prepare('SELECT id FROM licenses WHERE ls_order_id = ?').bind(orderId).first()
			: null;
		if (row) {
			await env.DB.prepare('UPDATE licenses SET ls_license_key = ? WHERE id = ?').bind(key, row.id).run();
		} else {
			const user = email ? await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first() : null;
			await env.DB.prepare(
				'INSERT INTO licenses (id, user_id, ls_license_key, ls_order_id, buyer_email, status) VALUES (?, ?, ?, ?, ?, ?) ' +
					'ON CONFLICT(ls_license_key) DO NOTHING',
			)
				.bind(newId(), user?.id ?? null, key, orderId, email, 'active')
				.run();
		}
		return new Response('ok', { status: 200 });
	}

	if (event === 'order_refunded') {
		const orderId = String(payload.data.id);
		await env.DB.prepare("UPDATE licenses SET status = 'refunded' WHERE ls_order_id = ?").bind(orderId).run();
		return new Response('ok', { status: 200 });
	}

	return new Response('ignored', { status: 200 });
}
