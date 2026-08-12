// Operator console API. Admins authenticate with the same signed Hangwork account
// session as the editor, then pass a second server-side allowlist check.
//
// Routes (wired in worker.js, all POST):
//   /admin/session          — prove this session belongs to an allowlisted operator
//   /admin/accounts/search  — find accounts by email, id, subdomain, or Polar identifiers
//   /admin/accounts/get     — account + license + site detail for one stable user id
//   /admin/licenses/grant    — add a manual entitlement (never edits paid purchase rows)
//   /admin/licenses/revoke   — revoke a manual entitlement
//   /admin/sites/status      — suspend or restore a published site
//
// GET /admin/funnel (funnel.js) reuses this file's requireAdmin gate.

import { json, readJson } from './lib/http.js';
import { sessionUser } from './auth.js';
import { mirrorSite, newId, touchUser } from './lib/db.js';

const PAGE_SIZE = 25;
const OWNER_SITE_STATUSES = new Set(['active', 'offline', 'under_construction']);
const ACCOUNT_SORTS = {
	activity:
		"MAX(COALESCE(u.last_sign_in_at, ''), COALESCE(s.last_published_at, ''), COALESCE(u.updated_at, u.created_at)) DESC, u.created_at DESC",
	sign_in: "u.last_sign_in_at IS NULL, u.last_sign_in_at DESC, u.created_at DESC",
	publish: "s.last_published_at IS NULL, s.last_published_at DESC, u.created_at DESC",
	updated: 'COALESCE(u.updated_at, u.created_at) DESC, u.created_at DESC',
};

function configuredValues(value, { lowercase = false } = {}) {
	return String(value || '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => (lowercase ? item.toLowerCase() : item));
}

/** Server-side authorization; never expose the allowlist to the browser bundle. */
export function isAdminUser(user, env) {
	if (!user) return false;
	const emails = configuredValues(env.ADMIN_EMAILS, { lowercase: true });
	const googleSubjects = configuredValues(env.ADMIN_GOOGLE_SUBS);
	return emails.includes(String(user.email || '').toLowerCase()) ||
		(Boolean(user.google_sub) && googleSubjects.includes(user.google_sub));
}

/** The allowlist gate every operator route (here and in funnel.js) passes through. */
export async function requireAdmin(request, env) {
	if (!env.SESSION_SECRET || !env.DB) return { error: 'accounts_unconfigured', status: 503 };
	if (!configuredValues(env.ADMIN_EMAILS).length && !configuredValues(env.ADMIN_GOOGLE_SUBS).length) {
		return { error: 'admin_unconfigured', status: 503 };
	}
	const user = await sessionUser(request, env);
	if (!user) return { error: 'invalid_session', status: 401 };
	if (!isAdminUser(user, env)) return { error: 'admin_forbidden', status: 403 };
	return { user };
}

function boolean(value) {
	return value === true || value === 1 || value === '1';
}

function escapeLike(value) {
	return value.replace(/[\\%_]/g, '\\$&');
}

function siteUrl(env, subdomain) {
	return subdomain && env.SITES_ROOT_DOMAIN ? `https://${subdomain}.${env.SITES_ROOT_DOMAIN}` : null;
}

function reasonFrom(body) {
	const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
	return reason.length >= 6 && reason.length <= 500 ? reason : null;
}

function auditStatement(env, actor, { action, targetUserId = null, targetSiteId = null, reason, before, after }) {
	return env.DB.prepare(
		`INSERT INTO admin_audit_log
			(id, actor_user_id, actor_email, action, target_user_id, target_site_id, reason, before_json, after_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).bind(
		newId(),
		actor.id,
		actor.email,
		action,
		targetUserId,
		targetSiteId,
		reason,
		before == null ? null : JSON.stringify(before),
		after == null ? null : JSON.stringify(after),
		new Date().toISOString(),
	);
}

export async function adminSession(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);
	return json({ user: { id: auth.user.id, email: auth.user.email } }, 200, corsOrigin);
}

export async function adminAccountSearch(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);

	const body = await readJson(request);
	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if ((query.length === 1 || query.length > 254)) return json({ error: 'invalid_query' }, 400, corsOrigin);
	const sort = typeof body?.sort === 'string' && Object.hasOwn(ACCOUNT_SORTS, body.sort) ? body.sort : 'activity';
	const page = Number.isInteger(body?.page) && body.page > 0 && body.page <= 10000 ? body.page : 1;

	const normalized = query.toLowerCase();
	const pattern = `%${escapeLike(normalized)}%`;
	const where = query
		? `WHERE LOWER(u.email) LIKE ? ESCAPE '\\'
			OR LOWER(u.id) LIKE ? ESCAPE '\\'
			OR EXISTS(
				SELECT 1 FROM sites matched_site
				WHERE matched_site.user_id = u.id
					AND LOWER(COALESCE(matched_site.subdomain, '')) LIKE ? ESCAPE '\\'
			)
			OR EXISTS(
				SELECT 1 FROM polar_orders matched_order
				WHERE matched_order.user_id = u.id
					AND (
						LOWER(COALESCE(matched_order.id, '')) = ?
						OR LOWER(COALESCE(matched_order.checkout_id, '')) = ?
						OR LOWER(COALESCE(matched_order.polar_customer_id, '')) = ?
					)
			)
			OR EXISTS(
				SELECT 1 FROM licenses legacy_purchase
				WHERE legacy_purchase.user_id = u.id
					AND LOWER(COALESCE(legacy_purchase.ls_order_id, '')) = ?
			)`
		: '';
	const searchBindings = query ? [pattern, pattern, pattern, normalized, normalized, normalized, normalized] : [];
	const offset = (page - 1) * PAGE_SIZE;
	const statement = env.DB.prepare(
		`SELECT /* admin-account-search */
			u.id,
			u.email,
			u.google_sub IS NOT NULL AS google_connected,
			u.created_at,
			u.last_sign_in_at,
			COALESCE(u.updated_at, u.created_at) AS updated_at,
			s.id AS site_id,
			s.subdomain,
			s.status AS site_status,
			s.last_published_at,
			EXISTS(
				SELECT 1 FROM polar_orders active_order
				WHERE active_order.user_id = u.id AND active_order.status = 'active'
			) OR EXISTS(
				SELECT 1 FROM manual_entitlements active_manual
				WHERE active_manual.user_id = u.id AND active_manual.status = 'active'
			) OR EXISTS(
				SELECT 1 FROM licenses legacy_purchase
				WHERE legacy_purchase.user_id = u.id AND legacy_purchase.status = 'active'
			) AS licensed,
			(
				(SELECT COUNT(*) FROM polar_orders user_order WHERE user_order.user_id = u.id)
				+
				(SELECT COUNT(*) FROM manual_entitlements user_manual WHERE user_manual.user_id = u.id)
				+
				(SELECT COUNT(*) FROM licenses legacy_purchase WHERE legacy_purchase.user_id = u.id)
			) AS license_count
		FROM users u
		LEFT JOIN sites s ON s.id = (
			SELECT chosen_site.id
			FROM sites chosen_site
			WHERE chosen_site.user_id = u.id
			ORDER BY chosen_site.last_published_at DESC, chosen_site.created_at DESC
			LIMIT 1
		)
		${where}
		ORDER BY ${ACCOUNT_SORTS[sort]}
		LIMIT ? OFFSET ?`,
	).bind(...searchBindings, PAGE_SIZE, offset);
	const countStatement = env.DB.prepare(
		`SELECT /* admin-account-search-count */ COUNT(*) AS total
		FROM users u
		${where}`,
	).bind(...searchBindings);
	const [{ results }, count] = await Promise.all([statement.all(), countStatement.first()]);
	const total = Number(count?.total || 0);

	return json(
		{
			results: (results ?? []).map((row) => ({
				user: {
					id: row.id,
					email: row.email,
					googleConnected: boolean(row.google_connected),
					createdAt: row.created_at,
					lastSignInAt: row.last_sign_in_at,
					updatedAt: row.updated_at,
				},
				licensed: boolean(row.licensed),
				licenseCount: Number(row.license_count || 0),
				site: row.site_id
					? {
							id: row.site_id,
							subdomain: row.subdomain,
							url: siteUrl(env, row.subdomain),
							status: row.site_status,
							lastPublishedAt: row.last_published_at,
						}
					: null,
			})),
			pagination: {
				page,
				pageSize: PAGE_SIZE,
				total,
				totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
			},
			sort,
		},
		200,
		corsOrigin,
	);
}

export async function adminAccountGet(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);

	const body = await readJson(request);
	const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
	if (!userId || userId.length > 64) return json({ error: 'invalid_query' }, 400, corsOrigin);

	const account = await env.DB.prepare(
		`SELECT /* admin-account-detail */
			u.id,
			u.email,
			u.google_sub IS NOT NULL AS google_connected,
			u.created_at,
			u.last_sign_in_at,
			COALESCE(u.updated_at, u.created_at) AS updated_at,
			s.id AS site_id,
			s.subdomain,
			s.status AS site_status,
			s.bytes_used,
			s.req_count_period,
			s.last_published_at,
			s.created_at AS site_created_at
		FROM users u
		LEFT JOIN sites s ON s.user_id = u.id
		WHERE u.id = ?
		ORDER BY s.created_at
		LIMIT 1`,
	)
		.bind(userId)
		.first();
	if (!account) return json({ error: 'user_not_found' }, 404, corsOrigin);

	const { results: polarRows } = await env.DB.prepare(
		`SELECT /* admin-account-polar-orders */
			id, polar_customer_id, checkout_id, product_id, buyer_email, status, paid_at, created_at
		FROM polar_orders
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 50`,
	)
		.bind(userId)
		.all();

	const { results: legacyRows } = await env.DB.prepare(
		`SELECT /* admin-account-legacy-purchases */
			id, ls_order_id, buyer_email, status, activated_at, created_at
		FROM licenses
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 50`,
	)
		.bind(userId)
		.all();

	const { results: manualRows } = await env.DB.prepare(
		`SELECT /* admin-account-manual-entitlements */
			id, status, reason, created_at, revoked_reason, revoked_at
		FROM manual_entitlements
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 50`,
	)
		.bind(userId)
		.all();

	let hostnameRows = [];
	let activeSuspension = null;
	if (account.site_id) {
		const page = await env.DB.prepare(
			`SELECT /* admin-account-hostnames */ hostname, kind, created_at
			FROM hostnames
			WHERE site_id = ?
			ORDER BY kind, hostname`,
		)
			.bind(account.site_id)
			.all();
		hostnameRows = page.results ?? [];
		activeSuspension = await env.DB.prepare(
			`SELECT /* admin-account-active-suspension */
				id, previous_status, reason, suspended_at
			FROM site_suspensions
			WHERE site_id = ? AND restored_at IS NULL
			ORDER BY suspended_at DESC
			LIMIT 1`,
		)
			.bind(account.site_id)
			.first();
	}

	const { results: auditRows } = await env.DB.prepare(
		`SELECT /* admin-account-audit */
			id, actor_email, action, reason, before_json, after_json, created_at
		FROM admin_audit_log
		WHERE target_user_id = ?
		ORDER BY created_at DESC
		LIMIT 25`,
	)
		.bind(userId)
		.all();

	const polarOrders = (polarRows ?? []).map((row) => ({
		id: row.id,
		customerId: row.polar_customer_id,
		checkoutId: row.checkout_id,
		productId: row.product_id,
		buyerEmail: row.buyer_email,
		status: row.status,
		paidAt: row.paid_at,
		createdAt: row.created_at,
	}));
	const legacyPurchases = (legacyRows ?? []).map((row) => ({
		id: row.id,
		orderId: row.ls_order_id,
		buyerEmail: row.buyer_email,
		status: row.status,
		activatedAt: row.activated_at,
		createdAt: row.created_at,
	}));
	const manualEntitlements = (manualRows ?? []).map((row) => ({
		id: row.id,
		status: row.status,
		reason: row.reason,
		createdAt: row.created_at,
		revokedReason: row.revoked_reason,
		revokedAt: row.revoked_at,
	}));

	return json(
		{
			user: {
				id: account.id,
				email: account.email,
				googleConnected: boolean(account.google_connected),
				createdAt: account.created_at,
				lastSignInAt: account.last_sign_in_at,
				updatedAt: account.updated_at,
			},
			licensed:
				polarOrders.some((order) => order.status === 'active') ||
				legacyPurchases.some((purchase) => purchase.status === 'active') ||
				manualEntitlements.some((entitlement) => entitlement.status === 'active'),
			polarOrders,
			legacyPurchases,
			manualEntitlements,
			site: account.site_id
				? {
						id: account.site_id,
						subdomain: account.subdomain,
						url: siteUrl(env, account.subdomain),
						status: account.site_status,
						bytesUsed: Number(account.bytes_used || 0),
						requestsThisPeriod: Number(account.req_count_period || 0),
						lastPublishedAt: account.last_published_at,
						createdAt: account.site_created_at,
						hostnames: hostnameRows.map((row) => ({
							hostname: row.hostname,
							kind: row.kind,
							createdAt: row.created_at,
						})),
						suspension: activeSuspension
							? {
									id: activeSuspension.id,
									previousStatus: activeSuspension.previous_status,
									reason: activeSuspension.reason,
									suspendedAt: activeSuspension.suspended_at,
								}
							: null,
					}
				: null,
			audit: (auditRows ?? []).map((row) => ({
				id: row.id,
				actorEmail: row.actor_email,
				action: row.action,
				reason: row.reason,
				before: row.before_json ? JSON.parse(row.before_json) : null,
				after: row.after_json ? JSON.parse(row.after_json) : null,
				createdAt: row.created_at,
			})),
		},
		200,
		corsOrigin,
	);
}

export async function adminLicenseGrant(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);

	const body = await readJson(request);
	const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
	const reason = reasonFrom(body);
	if (!userId || userId.length > 64 || !reason) return json({ error: 'invalid_admin_action' }, 400, corsOrigin);

	const user = await env.DB.prepare('SELECT /* admin-grant-user */ id, email FROM users WHERE id = ?').bind(userId).first();
	if (!user) return json({ error: 'user_not_found' }, 404, corsOrigin);

	const existing = await env.DB.prepare(
		`SELECT /* admin-grant-existing-access */ 1 AS licensed
		WHERE EXISTS(
			SELECT 1 FROM polar_orders WHERE user_id = ? AND status = 'active'
		)
		OR EXISTS(
			SELECT 1 FROM manual_entitlements WHERE user_id = ? AND status = 'active'
		)
		OR EXISTS(
			SELECT 1 FROM licenses WHERE user_id = ? AND status = 'active'
		)
		LIMIT 1`,
	)
		.bind(userId, userId, userId)
		.first();
	if (existing) return json({ error: 'account_already_licensed' }, 409, corsOrigin);

	const id = newId();
	const createdAt = new Date().toISOString();
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO manual_entitlements
				(id, user_id, status, reason, created_by_user_id, created_at)
			VALUES (?, ?, 'active', ?, ?, ?)`,
		).bind(id, userId, reason, auth.user.id, createdAt),
		auditStatement(env, auth.user, {
			action: 'manual_entitlement.granted',
			targetUserId: userId,
			reason,
			before: { licensed: false },
			after: { licensed: true, manualEntitlementId: id },
		}),
	]);
	await touchUser(env.DB, userId);
	return json({ granted: true, entitlementId: id }, 200, corsOrigin);
}

export async function adminLicenseRevoke(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);

	const body = await readJson(request);
	const entitlementId = typeof body?.entitlementId === 'string' ? body.entitlementId.trim() : '';
	const reason = reasonFrom(body);
	if (!entitlementId || entitlementId.length > 64 || !reason) {
		return json({ error: 'invalid_admin_action' }, 400, corsOrigin);
	}

	const entitlement = await env.DB.prepare(
		`SELECT /* admin-revoke-entitlement */ id, user_id, status, reason, created_at
		FROM manual_entitlements
		WHERE id = ?`,
	)
		.bind(entitlementId)
		.first();
	if (!entitlement) return json({ error: 'manual_entitlement_not_found' }, 404, corsOrigin);
	if (entitlement.status !== 'active') return json({ error: 'manual_entitlement_inactive' }, 409, corsOrigin);

	const revokedAt = new Date().toISOString();
	await env.DB.batch([
		env.DB.prepare(
			`UPDATE manual_entitlements
			SET status = 'revoked', revoked_by_user_id = ?, revoked_reason = ?, revoked_at = ?
			WHERE id = ? AND status = 'active'`,
		).bind(auth.user.id, reason, revokedAt, entitlementId),
		auditStatement(env, auth.user, {
			action: 'manual_entitlement.revoked',
			targetUserId: entitlement.user_id,
			reason,
			before: { status: entitlement.status, manualEntitlementId: entitlement.id },
			after: { status: 'revoked', manualEntitlementId: entitlement.id },
		}),
	]);
	await touchUser(env.DB, entitlement.user_id);
	return json({ revoked: true, entitlementId }, 200, corsOrigin);
}

export async function adminSiteStatus(request, env, corsOrigin) {
	const auth = await requireAdmin(request, env);
	if (auth.error) return json({ error: auth.error }, auth.status, corsOrigin);

	const body = await readJson(request);
	const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : '';
	const action = body?.action;
	const reason = reasonFrom(body);
	if (!siteId || siteId.length > 64 || (action !== 'suspend' && action !== 'restore') || !reason) {
		return json({ error: 'invalid_admin_action' }, 400, corsOrigin);
	}

	const site = await env.DB.prepare(
		'SELECT /* admin-site-status-target */ id, user_id, subdomain, status FROM sites WHERE id = ?',
	)
		.bind(siteId)
		.first();
	if (!site) return json({ error: 'site_not_found' }, 404, corsOrigin);

	if (action === 'suspend') {
		if (site.status === 'suspended') return json({ error: 'site_already_suspended' }, 409, corsOrigin);
		if (!OWNER_SITE_STATUSES.has(site.status)) return json({ error: 'site_locked' }, 409, corsOrigin);

		const suspensionId = newId();
		const suspendedAt = new Date().toISOString();
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO site_suspensions
					(id, site_id, previous_status, reason, suspended_by_user_id, suspended_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			).bind(suspensionId, site.id, site.status, reason, auth.user.id, suspendedAt),
			env.DB.prepare("UPDATE sites SET status = 'suspended' WHERE id = ?").bind(site.id),
			auditStatement(env, auth.user, {
				action: 'site.suspended',
				targetUserId: site.user_id,
				targetSiteId: site.id,
				reason,
				before: { status: site.status },
				after: { status: 'suspended', suspensionId },
			}),
		]);
		await touchUser(env.DB, site.user_id);
		await mirrorSite(env.DB, env.KV, site.id);
		return json({ status: 'suspended', suspensionId }, 200, corsOrigin);
	}

	if (site.status !== 'suspended') return json({ error: 'site_not_suspended' }, 409, corsOrigin);
	const suspension = await env.DB.prepare(
		`SELECT /* admin-site-active-suspension */ id, previous_status, reason, suspended_at
		FROM site_suspensions
		WHERE site_id = ? AND restored_at IS NULL
		ORDER BY suspended_at DESC
		LIMIT 1`,
	)
		.bind(site.id)
		.first();
	if (!suspension) return json({ error: 'suspension_record_missing' }, 409, corsOrigin);

	const restoredStatus = OWNER_SITE_STATUSES.has(suspension.previous_status) ? suspension.previous_status : 'active';
	const restoredAt = new Date().toISOString();
	await env.DB.batch([
		env.DB.prepare('UPDATE sites SET status = ? WHERE id = ?').bind(restoredStatus, site.id),
		env.DB.prepare(
			`UPDATE site_suspensions
			SET restored_by_user_id = ?, restore_reason = ?, restored_at = ?
			WHERE id = ? AND restored_at IS NULL`,
		).bind(auth.user.id, reason, restoredAt, suspension.id),
		auditStatement(env, auth.user, {
			action: 'site.restored',
			targetUserId: site.user_id,
			targetSiteId: site.id,
			reason,
			before: { status: site.status, suspensionId: suspension.id },
			after: { status: restoredStatus },
		}),
	]);
	await touchUser(env.DB, site.user_id);
	await mirrorSite(env.DB, env.KV, site.id);
	return json({ status: restoredStatus, restored: true }, 200, corsOrigin);
}
