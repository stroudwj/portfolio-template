// Polar checkout + webhook integration.
//
// The API token is server-only. Browser clients ask this Worker to create a
// short-lived Checkout Session, then navigate to Polar's hosted checkout URL.
// Sandbox and production use separate products, tokens, and webhook secrets.

import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { json } from './lib/http.js';
import {
	touchUser,
	userAccessPlan,
	pauseSiteForMissingAccess,
	restoreSubscriptionPausedSite,
} from './lib/db.js';
import { sessionUser } from './auth.js';

const CHECKOUT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredProductIds(env) {
	return new Set([env.POLAR_PRODUCT_ID, env.POLAR_MONTHLY_PRODUCT_ID].filter(Boolean));
}

function productIdForPlan(env, plan) {
	return plan === 'monthly' ? env.POLAR_MONTHLY_PRODUCT_ID || '' : env.POLAR_PRODUCT_ID || '';
}

function acceptsProduct(env, productId) {
	return Boolean(productId) && configuredProductIds(env).has(productId);
}

function polarApiBase(env) {
	if (env.POLAR_SERVER === 'sandbox') return 'https://sandbox-api.polar.sh/v1';
	if (env.POLAR_SERVER === 'production') return 'https://api.polar.sh/v1';
	return '';
}

function editorUrl(origin, env) {
	return new URL(env.EDITOR_PATH || '/editor/', origin);
}

function checkoutReturnUrls(origin, env) {
	const returnUrl = editorUrl(origin, env);
	const successUrl = new URL(returnUrl);
	successUrl.searchParams.set('polar_checkout', 'success');

	// Keep Polar's placeholder literal. URLSearchParams would percent-encode the
	// braces, preventing Polar from substituting the real checkout id.
	return {
		returnUrl: returnUrl.href,
		successUrl: `${successUrl.href}&checkout_id={CHECKOUT_ID}`,
	};
}

function isPolarCheckoutUrl(raw, server) {
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
		if (server === 'sandbox') return url.hostname === 'sandbox.polar.sh';
		return url.hostname === 'polar.sh' || url.hostname.endsWith('.polar.sh');
	} catch {
		return false;
	}
}

function polarHeaders(env) {
	return {
		Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
}

/** POST /checkout/polar — create a hosted Checkout Session for Hangwork. */
export async function polarCheckoutCreate(request, env, corsOrigin, origin) {
	const apiBase = polarApiBase(env);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	const plan = typeof body?.plan === 'string' ? body.plan : 'lifetime';
	if (plan !== 'lifetime' && plan !== 'monthly') return json({ error: 'invalid_plan' }, 400, corsOrigin);
	const productId = productIdForPlan(env, plan);
	if (!apiBase || !env.POLAR_ACCESS_TOKEN || !productId) {
		return json({ error: 'polar_unconfigured' }, 503, corsOrigin);
	}
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);
	const currentPlan = await userAccessPlan(env.DB, user.id);
	if (currentPlan === 'lifetime') return json({ error: 'account_already_licensed' }, 409, corsOrigin);
	if (currentPlan === 'monthly' && plan === 'monthly') return json({ error: 'account_already_subscribed' }, 409, corsOrigin);

	const { successUrl, returnUrl } = checkoutReturnUrls(origin, env);
	const customerIp = request.headers.get('CF-Connecting-IP') || '';
	const alternativeProductId = plan === 'lifetime' ? env.POLAR_MONTHLY_PRODUCT_ID : env.POLAR_PRODUCT_ID;
	const products = currentPlan === 'monthly'
		? [productId]
		: [productId, alternativeProductId].filter(Boolean);
	const upgradeDiscountId = currentPlan === 'monthly' && plan === 'lifetime'
		? env.POLAR_UPGRADE_DISCOUNT_ID || ''
		: '';
	const payload = {
		products,
		success_url: successUrl,
		return_url: returnUrl,
		allow_discount_codes: true,
		...(upgradeDiscountId ? { discount_id: upgradeDiscountId } : {}),
		metadata: {
			source: 'hangwork-editor',
			environment: env.POLAR_SERVER,
			plan,
		},
		customer_email: user.email,
		external_customer_id: user.id,
		...(customerIp ? { customer_ip_address: customerIp } : {}),
	};

	let response;
	try {
		response = await fetch(`${apiBase}/checkouts`, {
			method: 'POST',
			headers: polarHeaders(env),
			body: JSON.stringify(payload),
		});
	} catch {
		return json({ error: 'polar_unreachable' }, 502, corsOrigin);
	}

	const data = await response.json().catch(() => ({}));
	if (!response.ok || !isPolarCheckoutUrl(data?.url, env.POLAR_SERVER)) {
		return json({ error: 'polar_checkout_failed' }, 502, corsOrigin);
	}
	return json({ url: data.url }, 200, corsOrigin);
}

/** POST /checkout/polar/status — confirm the session state after Polar redirects back. */
export async function polarCheckoutStatus(request, env, corsOrigin) {
	const apiBase = polarApiBase(env);
	if (!apiBase || !env.POLAR_ACCESS_TOKEN || configuredProductIds(env).size === 0) {
		return json({ error: 'polar_unconfigured' }, 503, corsOrigin);
	}
	if (!env.SESSION_SECRET || !env.DB) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	const checkoutId = typeof body?.checkout_id === 'string' ? body.checkout_id.trim() : '';
	if (!CHECKOUT_ID.test(checkoutId)) return json({ error: 'invalid_checkout' }, 400, corsOrigin);

	let response;
	try {
		response = await fetch(`${apiBase}/checkouts/${checkoutId}`, {
			headers: polarHeaders(env),
		});
	} catch {
		return json({ error: 'polar_unreachable' }, 502, corsOrigin);
	}
	const data = await response.json().catch(() => ({}));
	if (
		!response.ok ||
		!acceptsProduct(env, data?.product_id) ||
		data?.external_customer_id !== user.id
	) {
		const upstreamFailure = !response.ok && response.status !== 404;
		return json({ error: 'checkout_not_found' }, upstreamFailure ? 502 : 404, corsOrigin);
	}
	return json(
		{ status: data.status, plan: data.product_id === env.POLAR_MONTHLY_PRODUCT_ID ? 'monthly' : 'lifetime' },
		200,
		corsOrigin,
	);
}

function standardWebhookHeaders(request) {
	return {
		'webhook-id': request.headers.get('webhook-id') || '',
		'webhook-signature': request.headers.get('webhook-signature') || '',
		'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
	};
}

function paidOrder(payload) {
	const order = payload?.data;
	if (payload?.type !== 'order.paid' || !order?.paid) return null;
	const email = typeof order.customer?.email === 'string' ? order.customer.email.trim().toLowerCase() : '';
	if (!order.id || !order.product_id || !email) return null;
	return {
		id: order.id,
		customerId: order.customer_id || order.customer?.id || null,
		externalCustomerId: order.customer?.external_id || null,
		checkoutId: order.checkout_id || null,
		subscriptionId: order.subscription_id || null,
		productId: order.product_id,
		email,
		paidAt: payload.timestamp || new Date().toISOString(),
	};
}

async function recordPaidOrder(env, order) {
	if (!acceptsProduct(env, order.productId)) return;
	const user = order.externalCustomerId
		? await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(order.externalCustomerId).first()
		: await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(order.email).first();
	const createdAt = new Date().toISOString();
	await env.DB.prepare(
		`INSERT INTO polar_orders
			(id, user_id, polar_customer_id, checkout_id, subscription_id, product_id, buyer_email, status, paid_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			user_id = COALESCE(polar_orders.user_id, excluded.user_id),
			polar_customer_id = excluded.polar_customer_id,
			checkout_id = excluded.checkout_id,
			subscription_id = excluded.subscription_id,
			product_id = excluded.product_id,
			buyer_email = excluded.buyer_email,
			status = 'active',
			paid_at = excluded.paid_at`,
	)
		.bind(
			order.id,
			user?.id ?? null,
			order.customerId,
			order.checkoutId,
			order.subscriptionId,
			order.productId,
			order.email,
			order.paidAt,
			createdAt,
		)
		.run();
	if (user?.id && order.productId === env.POLAR_PRODUCT_ID) {
		await revokeSupersededMonthlySubscriptions(env, user.id);
	}
	if (user?.id) await touchUser(env.DB, user.id);
	if (user?.id && env.KV) await restoreSubscriptionPausedSite(env.DB, env.KV, user.id);
}

/** Immediately stop any active monthly subscription after its customer buys the
 * lifetime upgrade. The paid lifetime order is inserted first, so Polar's
 * subscription.revoked webhook can never take the upgraded customer's access offline.
 * Throwing on an upstream failure makes Polar retry the order.paid webhook. */
async function revokeSupersededMonthlySubscriptions(env, userId) {
	if (!env.POLAR_MONTHLY_PRODUCT_ID) return;
	const { results } = await env.DB
		.prepare(
			`SELECT DISTINCT subscription_id FROM polar_orders
			WHERE user_id = ? AND product_id = ? AND status = 'active'
				AND subscription_id IS NOT NULL`,
		)
		.bind(userId, env.POLAR_MONTHLY_PRODUCT_ID)
		.all();
	const subscriptionIds = (results ?? []).map((row) => row.subscription_id).filter(Boolean);
	if (subscriptionIds.length === 0) return;
	const apiBase = polarApiBase(env);
	if (!apiBase || !env.POLAR_ACCESS_TOKEN) throw new Error('Polar subscription revocation is unconfigured');

	for (const subscriptionId of subscriptionIds) {
		let response;
		try {
			response = await fetch(`${apiBase}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
				method: 'DELETE',
				headers: polarHeaders(env),
			});
		} catch {
			throw new Error('Polar subscription revocation is unreachable');
		}
		// Missing/conflicted subscriptions are already inactive from Hangwork's
		// perspective, which keeps webhook retries idempotent.
		if (!response.ok && response.status !== 404 && response.status !== 409) {
			throw new Error('Polar subscription revocation failed');
		}
		await env.DB.prepare("UPDATE polar_orders SET status = 'revoked' WHERE subscription_id = ?")
			.bind(subscriptionId)
			.run();
	}
}

async function revokeOrder(env, payload) {
	if (payload?.type === 'benefit_grant.revoked' || payload?.type === 'subscription.revoked') {
		// A subscription revocation is authoritative only when the paid period really
		// ends (scheduled cancellations stay active until then).
		const subscriptionId = payload.type === 'subscription.revoked'
			? payload.data?.id
			: payload.data?.subscription_id;
		if (subscriptionId) {
			const affected = env.KV
				? await env.DB.prepare(
					'SELECT user_id FROM polar_orders WHERE subscription_id = ? AND user_id IS NOT NULL LIMIT 1',
				).bind(subscriptionId).first()
				: null;
			await env.DB.prepare("UPDATE polar_orders SET status = 'revoked' WHERE subscription_id = ?")
				.bind(subscriptionId)
				.run();
			if (affected?.user_id && env.KV) {
				await pauseSiteForMissingAccess(env.DB, env.KV, affected.user_id, subscriptionId);
			}
			return;
		}
		const orderId = payload.data?.order_id;
		if (orderId) {
			await env.DB.prepare("UPDATE polar_orders SET status = 'revoked' WHERE id = ?").bind(orderId).run();
		}
		return;
	}

	if (payload?.type !== 'order.refunded') return;
	const order = payload.data;
	if (!order?.id || !acceptsProduct(env, order.product_id)) return;
	// A partial refund does not revoke lifetime access; Polar's benefit-grant
	// revocation event remains authoritative if an operator revokes it manually.
	if (Number(order.refunded_amount || 0) < Number(order.total_amount || 0)) return;
	const affected = env.KV
		? await env.DB.prepare('SELECT user_id, subscription_id FROM polar_orders WHERE id = ?')
			.bind(order.id)
			.first()
		: null;
	await env.DB.prepare("UPDATE polar_orders SET status = 'refunded' WHERE id = ?").bind(order.id).run();
	if (affected?.user_id && env.KV) {
		await pauseSiteForMissingAccess(env.DB, env.KV, affected.user_id, affected.subscription_id || null);
	}
}

/** POST /webhooks/polar — Standard Webhooks signature auth; no CORS gate. */
export async function polarWebhook(request, env) {
	if (!env.POLAR_WEBHOOK_SECRET || configuredProductIds(env).size === 0 || !env.DB) {
		return new Response('unconfigured', { status: 503 });
	}
	const body = await request.text();
	let payload;
	try {
		const secret = new TextEncoder().encode(env.POLAR_WEBHOOK_SECRET);
		payload = new Webhook(secret, { format: 'raw' }).verify(body, standardWebhookHeaders(request));
	} catch (error) {
		if (error instanceof WebhookVerificationError) return new Response('invalid signature', { status: 401 });
		return new Response('invalid webhook', { status: 400 });
	}

	try {
		const order = paidOrder(payload);
		if (order) await recordPaidOrder(env, order);
		else await revokeOrder(env, payload);
	} catch {
		// A non-2xx response asks Polar to retry transient database or API failures.
		return new Response('processing failed', { status: 502 });
	}
	return new Response('ok', { status: 200 });
}

export const _test = {
	checkoutReturnUrls,
	isPolarCheckoutUrl,
	paidOrder,
};
