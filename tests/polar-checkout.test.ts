import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../oauth-proxy/worker.js';
import { Webhook } from 'standardwebhooks';
import { signJwt } from '../oauth-proxy/lib/jwt.js';

const ORIGIN = 'https://hangwork.art';
const PRODUCT_ID = 'c56f15d7-6325-4060-85a5-af7536f35e4c';
const MONTHLY_PRODUCT_ID = 'e0bad8e5-334c-4e74-a360-fec1252180ab';
const UPGRADE_DISCOUNT_ID = '65f0f394-54b4-4d72-8815-670315db60fb';
const CHECKOUT_ID = 'b419206b-45e0-4e46-9213-01fc19f629e7';
const USER_ID = 'buyer-user';
const USER_EMAIL = 'buyer@example.com';
const SESSION_SECRET = 'polar-checkout-session-secret';
function checkoutDb(plan: 'lifetime' | 'monthly' | null = null) {
	return {
		prepare(sql: string) {
			return {
				bind(id: string) {
					return {
						async first() {
							if (sql.includes('SELECT * FROM users WHERE id = ?') && id === USER_ID) {
								return { id: USER_ID, email: USER_EMAIL };
							}
							if (sql.includes('stable test-adapter marker')) return plan ? { plan } : null;
							return null;
						},
					};
				},
			};
		},
	};
}
const ENV = {
	ALLOWED_ORIGIN: ORIGIN,
	POLAR_SERVER: 'sandbox',
	POLAR_ACCESS_TOKEN: 'polar_oat_test',
	POLAR_PRODUCT_ID: PRODUCT_ID,
	POLAR_MONTHLY_PRODUCT_ID: MONTHLY_PRODUCT_ID,
	POLAR_UPGRADE_DISCOUNT_ID: UPGRADE_DISCOUNT_ID,
	SESSION_SECRET,
	DB: checkoutDb(),
};

function checkoutRequest(token: string, path = '/checkout/polar', body: unknown = {}) {
	return new Request(`https://worker.example${path}`, {
		method: 'POST',
		headers: {
			Origin: ORIGIN,
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '203.0.113.8',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	});
}

describe('Polar checkout sessions', () => {
	const fetchMock = vi.fn();
	let token: string;

	beforeEach(async () => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
		const now = Math.floor(Date.now() / 1000);
		token = await signJwt({ sub: USER_ID, iat: now, exp: now + 60 }, SESSION_SECRET);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('creates a sandbox checkout for only the configured product', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: CHECKOUT_ID,
					url: `https://sandbox.polar.sh/checkout/${CHECKOUT_ID}`,
				}),
				{ status: 201, headers: { 'Content-Type': 'application/json' } },
			),
		);

		const response = await worker.fetch(checkoutRequest(token), ENV);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			url: `https://sandbox.polar.sh/checkout/${CHECKOUT_ID}`,
		});

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://sandbox-api.polar.sh/v1/checkouts');
		expect(init.headers.Authorization).toBe('Bearer polar_oat_test');
		const payload = JSON.parse(init.body);
		expect(payload.products).toEqual([PRODUCT_ID, MONTHLY_PRODUCT_ID]);
		expect(payload.metadata.plan).toBe('lifetime');
		expect(payload.customer_ip_address).toBe('203.0.113.8');
		expect(payload.customer_email).toBe(USER_EMAIL);
		expect(payload.external_customer_id).toBe(USER_ID);
		expect(payload.success_url).toBe(
			'https://hangwork.art/editor/?polar_checkout=success&checkout_id={CHECKOUT_ID}',
		);
		expect(payload.return_url).toBe('https://hangwork.art/editor/');
	});

	it('creates a monthly checkout with monthly selected and lifetime available', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ url: `https://sandbox.polar.sh/checkout/${CHECKOUT_ID}` }),
				{ status: 201, headers: { 'Content-Type': 'application/json' } },
			),
		);
		const response = await worker.fetch(checkoutRequest(token, '/checkout/polar', { plan: 'monthly' }), ENV);
		expect(response.status).toBe(200);
		const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(payload.products).toEqual([MONTHLY_PRODUCT_ID, PRODUCT_ID]);
		expect(payload.metadata.plan).toBe('monthly');
	});

	it('rejects an unknown checkout plan before calling Polar', async () => {
		const response = await worker.fetch(checkoutRequest(token, '/checkout/polar', { plan: 'weekly' }), ENV);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid_plan' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('automatically applies the $10 credit when an active monthly customer upgrades', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ url: `https://sandbox.polar.sh/checkout/${CHECKOUT_ID}` }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			}),
		);
		const response = await worker.fetch(checkoutRequest(token, '/checkout/polar', { plan: 'lifetime' }), {
			...ENV,
			DB: checkoutDb('monthly'),
		});
		expect(response.status).toBe(200);
		const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(payload.products).toEqual([PRODUCT_ID]);
		expect(payload.discount_id).toBe(UPGRADE_DISCOUNT_ID);
	});

	it('uses Polar production endpoints for a production checkout', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: CHECKOUT_ID,
					url: `https://polar.sh/checkout/${CHECKOUT_ID}`,
				}),
				{ status: 201, headers: { 'Content-Type': 'application/json' } },
			),
		);

		const response = await worker.fetch(checkoutRequest(token), {
			...ENV,
			POLAR_SERVER: 'production',
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			url: `https://polar.sh/checkout/${CHECKOUT_ID}`,
		});
		expect(fetchMock.mock.calls[0][0]).toBe('https://api.polar.sh/v1/checkouts');
	});

	it('fails closed when Polar is unconfigured or returns a foreign URL', async () => {
		const unconfigured = await worker.fetch(checkoutRequest(token), {
			ALLOWED_ORIGIN: ORIGIN,
		});
		expect(unconfigured.status).toBe(503);

		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ url: 'https://evil.example/checkout' }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			}),
		);
		const unsafe = await worker.fetch(checkoutRequest(token), ENV);
		expect(unsafe.status).toBe(502);
		expect(await unsafe.json()).toEqual({ error: 'polar_checkout_failed' });
	});

	it('confirms a returned checkout belongs to the configured product', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({
				id: CHECKOUT_ID,
				product_id: PRODUCT_ID,
				external_customer_id: USER_ID,
				status: 'succeeded',
			}), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);
		const response = await worker.fetch(
			checkoutRequest(token, '/checkout/polar/status', { checkout_id: CHECKOUT_ID }),
			ENV,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'succeeded', plan: 'lifetime' });
	});

	it('requires a signed-in Hangwork account', async () => {
		const request = new Request('https://worker.example/checkout/polar', {
			method: 'POST',
			headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
			body: '{}',
		});
		const response = await worker.fetch(request, ENV);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'invalid_session' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

class PolarDb {
	orders: Array<Record<string, unknown>> = [];

	get order() {
		return this.orders.length ? this.orders[this.orders.length - 1] : null;
	}

	prepare(sql: string) {
		const db = this;
		let args: unknown[] = [];
		return {
			bind(...next: unknown[]) {
				args = next;
				return this;
			},
			async first() {
				if (sql.includes('SELECT id FROM users WHERE id = ?') || sql.includes('SELECT id FROM users WHERE email = ?')) {
					return { id: USER_ID };
				}
				throw new Error(`Unexpected first(): ${sql}`);
			},
			async all() {
				if (sql.includes('SELECT DISTINCT subscription_id FROM polar_orders')) {
					return {
						results: db.orders
							.filter((order) =>
								order.userId === args[0] &&
								order.productId === args[1] &&
								order.status === 'active' &&
								order.subscriptionId,
							)
							.map((order) => ({ subscription_id: order.subscriptionId })),
					};
				}
				throw new Error(`Unexpected all(): ${sql}`);
			},
			async run() {
				if (sql.includes('INSERT INTO polar_orders')) {
					const existing = db.orders.find((order) => order.id === args[0]);
					const next = {
						id: args[0],
						userId: args[1],
						subscriptionId: args[4],
						productId: args[5],
						email: args[6],
						status: 'active',
					};
					if (existing) Object.assign(existing, next);
					else db.orders.push(next);
					return { success: true };
				}
				if (sql.includes('UPDATE users SET updated_at')) return { success: true };
				if (sql.includes('UPDATE polar_orders SET status')) {
					const nextStatus = sql.includes("'refunded'") ? 'refunded' : 'revoked';
					if (sql.includes('WHERE subscription_id = ?')) {
						for (const order of db.orders) {
							if (order.subscriptionId === args[0]) order.status = nextStatus;
						}
					} else {
						const order = db.orders.find((candidate) => candidate.id === args[0]);
						if (order) order.status = nextStatus;
					}
					return { success: true };
				}
				throw new Error(`Unexpected run(): ${sql}`);
			},
		};
	}
}

function signedWebhook(
	payload: unknown,
	secret: string,
	db: PolarDb,
	envOverrides: Record<string, unknown> = {},
) {
	const body = JSON.stringify(payload);
	const id = 'msg_test';
	const timestamp = new Date();
	const verifier = new Webhook(new TextEncoder().encode(secret), { format: 'raw' });
	const signature = verifier.sign(id, timestamp, body);
	return worker.fetch(
		new Request('https://worker.example/webhooks/polar', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'webhook-id': id,
				'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
				'webhook-signature': signature,
			},
			body,
		}),
		{
			POLAR_WEBHOOK_SECRET: secret,
			POLAR_PRODUCT_ID: PRODUCT_ID,
			DB: db,
			...envOverrides,
		},
	);
}

describe('Polar webhook entitlement', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('records a signed paid order for the configured product', async () => {
		const db = new PolarDb();
		const response = await signedWebhook(
			{
				type: 'order.paid',
				timestamp: new Date().toISOString(),
				data: {
					id: 'order-1',
					paid: true,
					product_id: PRODUCT_ID,
					customer_id: 'customer-1',
					checkout_id: CHECKOUT_ID,
					customer: { email: 'BUYER@example.com', external_id: USER_ID },
				},
			},
			'polar-webhook-test-secret',
			db,
		);
		expect(response.status).toBe(200);
		expect(db.order).toMatchObject({
			id: 'order-1',
			userId: 'buyer-user',
			productId: PRODUCT_ID,
			email: 'buyer@example.com',
			status: 'active',
		});
	});

	it('revokes the monthly subscription immediately after a lifetime upgrade', async () => {
		const db = new PolarDb();
		db.orders.push({
			id: 'order-monthly',
			userId: USER_ID,
			subscriptionId: 'subscription-monthly',
			productId: MONTHLY_PRODUCT_ID,
			email: USER_EMAIL,
			status: 'active',
		});
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await signedWebhook(
			{
				type: 'order.paid',
				timestamp: new Date().toISOString(),
				data: {
					id: 'order-lifetime-upgrade',
					paid: true,
					product_id: PRODUCT_ID,
					customer_id: 'customer-1',
					checkout_id: CHECKOUT_ID,
					customer: { email: USER_EMAIL, external_id: USER_ID },
				},
			},
			'polar-webhook-test-secret',
			db,
			{
				POLAR_MONTHLY_PRODUCT_ID: MONTHLY_PRODUCT_ID,
				POLAR_ACCESS_TOKEN: 'polar_oat_test',
				POLAR_SERVER: 'production',
			},
		);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.polar.sh/v1/subscriptions/subscription-monthly',
			expect.objectContaining({ method: 'DELETE' }),
		);
		expect(db.orders.find((order) => order.id === 'order-monthly')?.status).toBe('revoked');
		expect(db.orders.find((order) => order.id === 'order-lifetime-upgrade')?.status).toBe('active');
	});

	it('returns a retryable error when Polar cannot stop the upgraded subscription', async () => {
		const db = new PolarDb();
		db.orders.push({
			id: 'order-monthly',
			userId: USER_ID,
			subscriptionId: 'subscription-monthly',
			productId: MONTHLY_PRODUCT_ID,
			email: USER_EMAIL,
			status: 'active',
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
		const response = await signedWebhook(
			{
				type: 'order.paid',
				timestamp: new Date().toISOString(),
				data: {
					id: 'order-lifetime-upgrade',
					paid: true,
					product_id: PRODUCT_ID,
					customer: { email: USER_EMAIL, external_id: USER_ID },
				},
			},
			'polar-webhook-test-secret',
			db,
			{
				POLAR_MONTHLY_PRODUCT_ID: MONTHLY_PRODUCT_ID,
				POLAR_ACCESS_TOKEN: 'polar_oat_test',
				POLAR_SERVER: 'production',
			},
		);
		expect(response.status).toBe(502);
		expect(db.orders.find((order) => order.id === 'order-monthly')?.status).toBe('active');
	});

	it('rejects an invalid signature', async () => {
		const response = await worker.fetch(
			new Request('https://worker.example/webhooks/polar', {
				method: 'POST',
				headers: {
					'webhook-id': 'msg_bad',
					'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
					'webhook-signature': 'v1,bad',
				},
				body: JSON.stringify({ type: 'order.paid', data: {} }),
			}),
			{
				POLAR_WEBHOOK_SECRET: 'real-secret',
				POLAR_PRODUCT_ID: PRODUCT_ID,
				DB: new PolarDb(),
			},
		);
		expect(response.status).toBe(401);
	});
});
