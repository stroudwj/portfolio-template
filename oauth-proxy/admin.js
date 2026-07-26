// Read-only operator console API. Admins authenticate with the same signed Hangwork
// account session as the editor, then pass a second server-side allowlist check.
//
// Routes (wired in worker.js, all POST):
//   /admin/session          — prove this session belongs to an allowlisted operator
//   /admin/accounts/search  — find accounts by email, id, subdomain, order id, or key
//   /admin/accounts/get     — account + license + site detail for one stable user id
//
// This module deliberately contains SELECTs only. Account/site/license mutations belong
// in a later, separately audited operator surface.

import { json, readJson } from './lib/http.js';
import { sessionUser } from './auth.js';

const MAX_RESULTS = 20;

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

async function requireAdmin(request, env) {
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

function maskLicenseKey(key) {
	if (typeof key !== 'string' || !key) return null;
	return `••••${key.slice(-4)}`;
}

function siteUrl(env, subdomain) {
	return subdomain && env.SITES_ROOT_DOMAIN ? `https://${subdomain}.${env.SITES_ROOT_DOMAIN}` : null;
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
	if (query.length < 2 || query.length > 254) return json({ error: 'invalid_query' }, 400, corsOrigin);

	const normalized = query.toLowerCase();
	const pattern = `%${escapeLike(normalized)}%`;
	const { results } = await env.DB.prepare(
		`SELECT /* admin-account-search */
			u.id,
			u.email,
			u.google_sub IS NOT NULL AS google_connected,
			u.created_at,
			s.id AS site_id,
			s.subdomain,
			s.status AS site_status,
			s.last_published_at,
			EXISTS(
				SELECT 1 FROM licenses active_license
				WHERE active_license.user_id = u.id AND active_license.status = 'active'
			) AS licensed,
			(SELECT COUNT(*) FROM licenses user_license WHERE user_license.user_id = u.id) AS license_count
		FROM users u
		LEFT JOIN sites s ON s.user_id = u.id
		WHERE LOWER(u.email) LIKE ? ESCAPE '\\'
			OR LOWER(u.id) LIKE ? ESCAPE '\\'
			OR LOWER(COALESCE(s.subdomain, '')) LIKE ? ESCAPE '\\'
			OR EXISTS(
				SELECT 1 FROM licenses matched_license
				WHERE matched_license.user_id = u.id
					AND (
						LOWER(COALESCE(matched_license.ls_license_key, '')) = ?
						OR LOWER(COALESCE(matched_license.ls_order_id, '')) = ?
					)
			)
		ORDER BY u.created_at DESC
		LIMIT ${MAX_RESULTS}`,
	)
		.bind(pattern, pattern, pattern, normalized, normalized)
		.all();

	return json(
		{
			results: (results ?? []).map((row) => ({
				user: {
					id: row.id,
					email: row.email,
					googleConnected: boolean(row.google_connected),
					createdAt: row.created_at,
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

	const { results: licenseRows } = await env.DB.prepare(
		`SELECT /* admin-account-licenses */
			id, ls_license_key, ls_order_id, buyer_email, status, activated_at, created_at
		FROM licenses
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 50`,
	)
		.bind(userId)
		.all();

	let hostnameRows = [];
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
	}

	const licenses = (licenseRows ?? []).map((row) => ({
		id: row.id,
		key: maskLicenseKey(row.ls_license_key),
		orderId: row.ls_order_id,
		buyerEmail: row.buyer_email,
		status: row.status,
		activatedAt: row.activated_at,
		createdAt: row.created_at,
	}));

	return json(
		{
			user: {
				id: account.id,
				email: account.email,
				googleConnected: boolean(account.google_connected),
				createdAt: account.created_at,
			},
			licensed: licenses.some((license) => license.status === 'active'),
			licenses,
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
					}
				: null,
		},
		200,
		corsOrigin,
	);
}
