// Hangwork accounts — passwordless auth + audited tester access.
//
// Routes (wired in worker.js):
//   POST /auth/magic/start   { email }        → email a single-use sign-in link (Resend)
//   POST /auth/magic/verify  { token }        → nonce → session JWT + account summary
//   POST /auth/google        { code, redirect_uri } → Google code → session JWT + summary
//   POST /auth/session       (Bearer)         → validate JWT, return account summary
//   POST /auth/test-access/redeem { code } (Bearer) → reusable tester code → manual grant
//
// The session is a stateless 30-day HS256 JWT signed with SESSION_SECRET. Sign-out is
// client-side (drop the token) — nothing server-side to revoke, and the license/site
// gates are re-checked in D1 on every publish anyway.

import { signJwt, verifyJwt, decodeJwtPayload, bearerToken } from './lib/jwt.js';
import { json, readJson, isEmailAddress } from './lib/http.js';
import { emailHtml, sendEmail } from './lib/email.js';
import { upsertUserByEmail, getUser, accountSummary, newId, recordUserSignIn, touchUser } from './lib/db.js';

const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const MAGIC_TTL_S = 15 * 60; // sign-in link validity

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
	await recordUserSignIn(env.DB, user.id);
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
	await recordUserSignIn(env.DB, user.id);
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

// ---- reusable tester access -----------------------------------------------

const TEST_ACCESS_REASON = 'Tester access code';

/**
 * Redeem the shared, rotatable tester code for account-level publishing access.
 *
 * This deliberately creates a manual entitlement rather than a paid purchase. The admin
 * console can inspect and revoke it without touching Polar or grandfathered purchase rows.
 * Once an account's tester grant is revoked, the same shared code cannot silently grant
 * that account access again; an operator must restore it manually.
 */
export async function testAccessRedeem(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const configured = typeof env.TEST_ACCESS_CODE === 'string' ? env.TEST_ACCESS_CODE.trim() : '';
	if (configured.length < 12 || configured.length > 128) {
		return json({ error: 'test_access_unconfigured' }, 503, corsOrigin);
	}

	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);

	const body = await readJson(request);
	const supplied = typeof body?.code === 'string' ? body.code.trim() : '';
	if (!supplied || supplied.length > 128) return json({ error: 'invalid_test_access_code' }, 400, corsOrigin);

	// Compare fixed-length HMAC digests so the response timing does not reveal a useful
	// prefix signal if this endpoint is ever probed.
	const [suppliedDigest, configuredDigest] = await Promise.all([
		hmacHex('hangwork-test-access', supplied),
		hmacHex('hangwork-test-access', configured),
	]);
	if (!timingSafeEqual(suppliedDigest, configuredDigest)) {
		return json({ error: 'invalid_test_access_code' }, 400, corsOrigin);
	}

	const prior = await env.DB.prepare(
		`SELECT id, status
		FROM manual_entitlements
		WHERE user_id = ? AND reason = ?
		ORDER BY created_at DESC
		LIMIT 1`,
	)
		.bind(user.id, TEST_ACCESS_REASON)
		.first();
	if (prior?.status === 'revoked') return json({ error: 'test_access_revoked' }, 403, corsOrigin);

	const before = await accountSummary(env.DB, user);
	if (before.licensed) return json(before, 200, corsOrigin);

	const id = newId();
	const createdAt = new Date().toISOString();
	await env.DB.batch([
		env.DB.prepare(
			`INSERT OR IGNORE INTO manual_entitlements
				(id, user_id, status, reason, created_by_user_id, created_at)
			VALUES (?, ?, 'active', ?, ?, ?)`,
		).bind(id, user.id, TEST_ACCESS_REASON, user.id, createdAt),
		env.DB.prepare(
			`INSERT INTO admin_audit_log
				(id, actor_user_id, actor_email, action, target_user_id, reason, before_json, after_json, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			newId(),
			user.id,
			user.email,
			'test_access.redeemed',
			user.id,
			TEST_ACCESS_REASON,
			JSON.stringify({ licensed: false }),
			JSON.stringify({ licensed: true, manualEntitlementId: id }),
			createdAt,
		),
	]);
	await touchUser(env.DB, user.id);
	return json(await accountSummary(env.DB, user), 200, corsOrigin);
}

// ---- constant-time tester-code helpers ------------------------------------

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
