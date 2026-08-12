// Product-site funnel analytics: how many visitors reach each funnel step, and which
// tagged link (a UGC post, a newsletter, an ad) sent them.
//
// Privacy posture is identical to analytics.js: no cookies, no IP address, no user
// agent, no referrer and no per-visitor trail is stored — only counts per step per
// attribution tag per month. The events are anonymous by construction, so `/funnel/event`
// needs no session; the CORS allowlist in worker.js is what keeps it to our own origins.
//
// Routes (wired in worker.js):
//   POST /funnel/event  — one step reach from the product site (browser beacon)
//   GET  /admin/funnel  — the operator dashboard read (admin allowlist)

import { json, cors } from './lib/http.js';
import { requireAdmin } from './admin.js';
import {
	DIRECT_REF,
	FUNNEL_REF_LIMIT,
	FUNNEL_STEPS,
	OVERFLOW_REF,
	isFunnelStep,
	sanitizeFunnelRef,
} from './lib/funnel-contract.js';

const MAX_BODY_BYTES = 1024;
const KV_TTL_SECONDS = 400 * 24 * 60 * 60;
const PERIOD_COUNT = 6;

function periodKey(period) {
	return `funnel:${period}`;
}

function recentPeriods(count = PERIOD_COUNT) {
	const periods = [];
	const date = new Date();
	date.setUTCDate(1);
	for (let index = 0; index < count; index += 1) {
		periods.push(date.toISOString().slice(0, 7));
		date.setUTCMonth(date.getUTCMonth() - 1);
	}
	return periods;
}

/**
 * POST /funnel/event — `{ step, ref }` from src/lib/funnel.ts.
 *
 * Aggregated into one KV value per month: `funnel:<YYYY-MM>` →
 * `{ steps: { [step]: { [ref]: count } } }`. Read-modify-write races lose the occasional
 * count under concurrency; the serving Worker's analytics handler accepts the same race
 * at the same scale, and these are marketing directionals, not billing. Documented, not
 * solved — solving it means Durable Objects for a number that only has to be roughly right.
 */
export async function funnelEvent(request, env, corsOrigin) {
	if (!env.KV) return json({ error: 'analytics_unconfigured' }, 503, corsOrigin);
	if (Number(request.headers.get('Content-Length') || '0') > MAX_BODY_BYTES) {
		return json({ error: 'payload_too_large' }, 413, corsOrigin);
	}

	// The header is the cheap check; the read is the honest one (sendBeacon sets
	// Content-Length, a hand-rolled POST need not).
	let body;
	try {
		const text = await request.text();
		if (text.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, corsOrigin);
		body = JSON.parse(text);
	} catch {
		return json({ error: 'invalid_json' }, 400, corsOrigin);
	}
	if (!isFunnelStep(body?.step)) return json({ error: 'invalid_step' }, 400, corsOrigin);
	const step = body.step;
	const ref = sanitizeFunnelRef(body?.ref);

	const key = periodKey(new Date().toISOString().slice(0, 7));
	const aggregate = (await env.KV.get(key, 'json')) || { steps: {} };
	if (!aggregate.steps || typeof aggregate.steps !== 'object') aggregate.steps = {};
	const bucket = aggregate.steps[step] || {};
	// A new tag once the month's tag list is full folds into `other`, so nobody can grow
	// this value without bound by inventing ?ref= values.
	const countedRef = bucket[ref] === undefined && Object.keys(bucket).length >= FUNNEL_REF_LIMIT ? OVERFLOW_REF : ref;
	bucket[countedRef] = (Number(bucket[countedRef]) || 0) + 1;
	aggregate.steps[step] = bucket;
	aggregate.updatedAt = new Date().toISOString();
	await env.KV.put(key, JSON.stringify(aggregate), { expirationTtl: KV_TTL_SECONDS });

	return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...cors(corsOrigin) } });
}

/**
 * GET /admin/funnel — the last six months of aggregates for the operator console, plus
 * the purchase count per month read from D1 (the Polar webhook's ledger, which the
 * browser can neither fake nor miss).
 */
export async function adminFunnel(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);
	if (!env.KV) return json({ error: 'analytics_unconfigured' }, 503, corsOrigin);

	const periods = recentPeriods();
	const snapshots = await Promise.all(
		periods.map(async (period) => ({
			period,
			data: (await env.KV.get(periodKey(period), 'json')) || { steps: {} },
		})),
	);

	const { results: orderRows } = await env.DB.prepare(
		`SELECT /* admin-funnel-purchases */
			substr(COALESCE(paid_at, created_at), 1, 7) AS period,
			COUNT(*) AS purchases
		FROM polar_orders
		WHERE status = 'active'
		GROUP BY period`,
	).all();
	const purchasesByPeriod = new Map(
		(orderRows ?? []).map((row) => [String(row.period), Number(row.purchases) || 0]),
	);

	return json(
		{
			steps: FUNNEL_STEPS,
			periods: snapshots.map(({ period, data }) => {
				const steps = {};
				const refs = new Set([DIRECT_REF]);
				for (const step of FUNNEL_STEPS) {
					const bucket = (data.steps && data.steps[step]) || {};
					const counts = {};
					for (const [ref, count] of Object.entries(bucket)) {
						const value = Number(count) || 0;
						if (!value) continue;
						counts[ref] = value;
						refs.add(ref);
					}
					steps[step] = counts;
				}
				return {
					period,
					refs: [...refs].sort(),
					steps,
					purchases: purchasesByPeriod.get(period) || 0,
					updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
				};
			}),
		},
		200,
		corsOrigin,
	);
}
