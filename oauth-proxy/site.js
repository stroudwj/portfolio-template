// Site management — subdomains, custom hostnames, export (Direction D, Subsystems 5 + 7).
//
// Routes (wired in worker.js):
//   POST /site/subdomain/check    { name }   (Bearer) → { available }
//   POST /site/subdomain/claim    { name }   (Bearer) → claim [name].hangwork.art
//   POST /site/custom-hostname        { domain } (Bearer) → create CF-for-SaaS hostname,
//                                                           answer the DCV records to add
//   POST /site/custom-hostname/status { domain } (Bearer) → poll; routes traffic when active
//   POST /site/custom-hostname/remove { domain } (Bearer) → detach + delete
//   GET  /site/export                          (Bearer) → zip of the site's R2 objects
//
// Subdomains are no longer DNS records (the wildcard *.hangwork.art record routes
// everything to the serving Worker): a claim is ONE D1 hostnames row + KV mirror, and
// the sites/hostnames rows are the ownership ledger the old CNAME-target trick used
// to approximate.

import { Zip, ZipPassThrough } from 'fflate';
import { json, readJson } from './lib/http.js';
import { sessionUser } from './auth.js';
import {
	getSite,
	getSiteForUser,
	createSite,
	mirrorHostname,
	dropHostname,
	mirrorSite,
	setSiteStatus,
	listHostnames,
	deleteSiteRows,
} from './lib/db.js';

// Statuses the site's OWNER can set from the editor. Admin/legal states
// (suspended, taken_down, over_quota) are deliberately excluded — a flip into
// or out of those is never a self-serve action.
export const USER_SITE_STATUSES = new Set(['active', 'offline', 'under_construction']);
// While a site is in one of these, the owner cannot change its visibility or
// delete it from the editor — an operator has locked it.
const ADMIN_LOCKED_STATUSES = new Set(['suspended', 'taken_down']);

const CF_API = 'https://api.cloudflare.com/client/v4';

// Subdomains we will never hand out: infrastructure, mail, and anything that could be
// mistaken for the product itself. (Moved here from worker.js; the legacy GitHub-Pages
// claim route shares it.)
export const RESERVED_SUBDOMAINS = new Set([
	'www', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'mx',
	'api', 'cdn', 'static', 'assets', 'admin', 'root', 'dev', 'test', 'staging',
	'app', 'editor', 'demo', 'docs', 'help', 'support', 'status', 'blog', 'shop',
	'account', 'accounts', 'login', 'auth', 'pay', 'payments', 'billing', 'hangwork',
]);

/** One DNS label: a–z, 0–9, inner hyphens, ≤63 chars. Mirrors the editor's slugify. */
export function isValidSubdomain(name) {
	return typeof name === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) && !RESERVED_SUBDOMAINS.has(name);
}

const ready = (env) => env.SESSION_SECRET && env.DB && env.KV;

/** Is `name` claimable (or already this site's)? Returns 'free' | 'ours' | 'taken'. */
async function subdomainStatus(env, siteId, name) {
	const owner = await env.DB.prepare('SELECT id FROM sites WHERE subdomain = ?').bind(name).first();
	if (owner) return owner.id === siteId ? 'ours' : 'taken';
	// Defense in depth: a hostnames row on the exact fqdn (whatever its kind) also blocks.
	const fqdn = `${name}.${env.SITES_ROOT_DOMAIN}`;
	const host = await env.DB.prepare('SELECT site_id FROM hostnames WHERE hostname = ?').bind(fqdn).first();
	return host && host.site_id !== siteId ? 'taken' : 'free';
}

/**
 * Claim [name].hangwork.art for a site: sites.subdomain + hostnames row + KV mirror.
 * Idempotent for re-claims of the site's own name. Returns { domain } or { error, status }.
 * Shared with /publish (a first publish claims its address in the same call).
 */
export async function claimSubdomainForSite(env, site, name) {
	if (!isValidSubdomain(name)) return { error: 'invalid_name', status: 400 };
	const state = await subdomainStatus(env, site.id, name);
	if (state === 'taken') return { error: 'name_taken', status: 409 };
	const fqdn = `${name}.${env.SITES_ROOT_DOMAIN}`;
	if (state !== 'ours' || site.subdomain !== name) {
		// A rename releases the old address (and its KV route) in the same step.
		if (site.subdomain && site.subdomain !== name) {
			const old = `${site.subdomain}.${env.SITES_ROOT_DOMAIN}`;
			await env.DB.prepare('DELETE FROM hostnames WHERE hostname = ?').bind(old).run();
			await dropHostname(env.KV, old);
		}
		await env.DB.prepare('UPDATE sites SET subdomain = ? WHERE id = ?').bind(name, site.id).run();
		await env.DB.prepare(
			"INSERT INTO hostnames (hostname, site_id, kind) VALUES (?, ?, 'subdomain') ON CONFLICT(hostname) DO NOTHING",
		)
			.bind(fqdn, site.id)
			.run();
	}
	await mirrorHostname(env.KV, fqdn, site.id, site.status);
	return { domain: fqdn };
}

async function requireUserSite(request, env, { create = false } = {}) {
	const user = await sessionUser(request, env);
	if (!user) return { error: 'invalid_session', status: 401 };
	let site = await getSiteForUser(env.DB, user.id);
	if (!site && create) site = await createSite(env.DB, user.id);
	if (!site) return { error: 'no_site', status: 404 };
	return { user, site };
}

// ---- subdomains ------------------------------------------------------------

export async function subdomainCheck(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);
	const body = await readJson(request);
	const name = typeof body?.name === 'string' ? body.name : '';
	if (!isValidSubdomain(name)) return json({ error: 'invalid_name' }, 400, corsOrigin);
	const site = await getSiteForUser(env.DB, user.id);
	const state = await subdomainStatus(env, site?.id ?? '', name);
	const domain = `${name}.${env.SITES_ROOT_DOMAIN}`;
	if (state === 'taken') return json({ error: 'name_taken', domain }, 409, corsOrigin);
	return json({ available: true, domain }, 200, corsOrigin);
}

export async function subdomainClaim(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env, { create: true });
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const body = await readJson(request);
	const result = await claimSubdomainForSite(env, got.site, typeof body?.name === 'string' ? body.name : '');
	if (result.error) return json({ error: result.error }, result.status, corsOrigin);
	return json({ domain: result.domain }, 200, corsOrigin);
}

// ---- custom hostnames (Cloudflare for SaaS) --------------------------------

function isValidCustomDomain(domain) {
	return (
		typeof domain === 'string' &&
		domain.length <= 253 &&
		/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(domain)
	);
}

function cfHeaders(env) {
	return { Authorization: `Bearer ${env.CF_SAAS_TOKEN}`, 'Content-Type': 'application/json' };
}

/** Normalize a CF custom-hostname result into what the modal renders. */
function hostnameView(env, result) {
	const records = [];
	// Routing record: the user points their domain at the fallback origin.
	records.push({ purpose: 'routing', type: 'CNAME', name: result.hostname, value: env.SITES_ROOT_DOMAIN });
	const ownership = result.ownership_verification;
	if (ownership?.type === 'txt') {
		records.push({ purpose: 'ownership', type: 'TXT', name: ownership.name, value: ownership.value });
	}
	for (const record of result.ssl?.validation_records ?? []) {
		if (record.txt_name) records.push({ purpose: 'certificate', type: 'TXT', name: record.txt_name, value: record.txt_value });
	}
	return {
		domain: result.hostname,
		status: result.status, // pending | active | …
		sslStatus: result.ssl?.status,
		records,
	};
}

async function findCustomHostname(env, domain) {
	const res = await fetch(
		`${CF_API}/zones/${env.CF_ZONE_ID}/custom_hostnames?hostname=${encodeURIComponent(domain)}`,
		{ headers: cfHeaders(env) },
	);
	const data = await res.json();
	if (!res.ok || !data.success) return null;
	return data.result?.[0] ?? null;
}

export async function customHostnameCreate(request, env, corsOrigin) {
	if (!ready(env) || !env.CF_SAAS_TOKEN || !env.CF_ZONE_ID) return json({ error: 'custom_domains_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const body = await readJson(request);
	const domain = typeof body?.domain === 'string' ? body.domain.trim().toLowerCase() : '';
	if (!isValidCustomDomain(domain) || domain.endsWith(`.${env.SITES_ROOT_DOMAIN}`)) {
		return json({ error: 'invalid_domain' }, 400, corsOrigin);
	}

	// One domain maps to one site, ever — first claim wins.
	const existingRow = await env.DB.prepare('SELECT site_id FROM hostnames WHERE hostname = ?').bind(domain).first();
	if (existingRow && existingRow.site_id !== got.site.id) return json({ error: 'domain_taken' }, 409, corsOrigin);

	let result = await findCustomHostname(env, domain);
	if (!result) {
		let res;
		try {
			res = await fetch(`${CF_API}/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
				method: 'POST',
				headers: cfHeaders(env),
				body: JSON.stringify({ hostname: domain, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } } }),
			});
		} catch {
			return json({ error: 'cloudflare_unreachable' }, 502, corsOrigin);
		}
		const data = await res.json().catch(() => null);
		if (!res.ok || !data?.success) return json({ error: 'hostname_create_failed' }, 502, corsOrigin);
		result = data.result;
	}

	// Route immediately: the row is inert until the user's DNS actually points here,
	// and it reserves the domain against other accounts.
	await env.DB.prepare(
		"INSERT INTO hostnames (hostname, site_id, kind) VALUES (?, ?, 'custom') ON CONFLICT(hostname) DO NOTHING",
	)
		.bind(domain, got.site.id)
		.run();
	await mirrorHostname(env.KV, domain, got.site.id, got.site.status);

	return json(hostnameView(env, result), 200, corsOrigin);
}

export async function customHostnameStatus(request, env, corsOrigin) {
	if (!ready(env) || !env.CF_SAAS_TOKEN || !env.CF_ZONE_ID) return json({ error: 'custom_domains_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const body = await readJson(request);
	const domain = typeof body?.domain === 'string' ? body.domain.trim().toLowerCase() : '';
	const row = await env.DB.prepare('SELECT site_id FROM hostnames WHERE hostname = ?').bind(domain).first();
	if (!row || row.site_id !== got.site.id) return json({ error: 'not_found' }, 404, corsOrigin);
	const result = await findCustomHostname(env, domain);
	if (!result) return json({ error: 'not_found' }, 404, corsOrigin);
	return json(hostnameView(env, result), 200, corsOrigin);
}

/** Detach a Cloudflare-for-SaaS custom hostname at the edge. Best-effort: a missing
 *  token or a hostname CF has already forgotten is fine — the D1/KV rows are what
 *  actually stop routing. Shared by customHostnameRemove and siteDelete. */
async function removeCustomHostnameAtEdge(env, domain) {
	if (!env.CF_SAAS_TOKEN || !env.CF_ZONE_ID) return;
	const result = await findCustomHostname(env, domain);
	if (result?.id) {
		await fetch(`${CF_API}/zones/${env.CF_ZONE_ID}/custom_hostnames/${result.id}`, {
			method: 'DELETE',
			headers: cfHeaders(env),
		}).catch(() => {});
	}
}

export async function customHostnameRemove(request, env, corsOrigin) {
	if (!ready(env) || !env.CF_SAAS_TOKEN || !env.CF_ZONE_ID) return json({ error: 'custom_domains_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const body = await readJson(request);
	const domain = typeof body?.domain === 'string' ? body.domain.trim().toLowerCase() : '';
	const row = await env.DB.prepare('SELECT site_id FROM hostnames WHERE hostname = ?').bind(domain).first();
	if (!row || row.site_id !== got.site.id) return json({ error: 'not_found' }, 404, corsOrigin);

	await removeCustomHostnameAtEdge(env, domain);
	await env.DB.prepare('DELETE FROM hostnames WHERE hostname = ?').bind(domain).run();
	await dropHostname(env.KV, domain);
	return json({ removed: true }, 200, corsOrigin);
}

// ---- visibility (owner-controlled status) ----------------------------------

/**
 * POST /site/status { status } — the owner takes their own site offline, shows an
 * "under construction" holding page, or brings it back live. The serving Worker reads
 * status from the KV mirror, so one D1 write + re-mirror flips what every visitor sees;
 * publishing still works in any of these states, so a site can be updated while paused.
 */
export async function siteStatusSet(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const body = await readJson(request);
	const status = typeof body?.status === 'string' ? body.status : '';
	if (!USER_SITE_STATUSES.has(status)) return json({ error: 'invalid_status' }, 400, corsOrigin);
	// An operator-locked site is not the owner's to toggle.
	if (ADMIN_LOCKED_STATUSES.has(got.site.status)) return json({ error: 'site_locked' }, 403, corsOrigin);

	await setSiteStatus(env.DB, got.site.id, status);
	await mirrorSite(env.DB, env.KV, got.site.id);
	return json({ status }, 200, corsOrigin);
}

// ---- delete (permanent) ----------------------------------------------------

/** Delete every R2 object under a site's key prefix, a page (≤1000 keys) at a time. */
async function purgeSiteObjects(bucket, siteId) {
	const prefix = `${siteId}/`;
	let cursor;
	do {
		const page = await bucket.list({ prefix, cursor });
		const keys = page.objects.map((object) => object.key);
		if (keys.length) await bucket.delete(keys);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

/**
 * POST /site/delete { confirm } — permanently erase the site: all R2 objects, every
 * hostname (custom hostnames detached at the Cloudflare edge too), and the D1 rows. The
 * user and their license are deliberately kept — the license is theirs and a fresh
 * publish starts a brand-new site (new id, new R2 prefix). Irreversible; `confirm` must
 * echo the site's subdomain (or "DELETE" for a never-published site) so a stray call
 * can't wipe a site.
 */
export async function siteDelete(request, env, corsOrigin) {
	if (!ready(env) || !env.SITES) return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const site = got.site;
	if (ADMIN_LOCKED_STATUSES.has(site.status)) return json({ error: 'site_locked' }, 403, corsOrigin);

	const body = await readJson(request);
	const confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
	const expected = site.subdomain || 'DELETE';
	if (confirm !== expected) return json({ error: 'confirm_mismatch' }, 400, corsOrigin);

	// Detach custom hostnames at the edge + drop every KV route BEFORE removing objects,
	// so nothing can be served from a half-deleted site.
	const hostnames = await listHostnames(env.DB, site.id);
	for (const row of hostnames) {
		if (row.kind === 'custom') await removeCustomHostnameAtEdge(env, row.hostname);
		await dropHostname(env.KV, row.hostname);
	}
	await purgeSiteObjects(env.SITES, site.id);
	await deleteSiteRows(env.DB, site.id);
	return json({ deleted: true }, 200, corsOrigin);
}

// ---- export (the ownership guarantee) --------------------------------------

/**
 * GET /site/export — stream the site's R2 objects as a zip, built on demand (no extra
 * storage). Store-only entries (no deflate) keep Worker CPU time negligible; the files
 * are already-compressed images/HTML anyway.
 */
export async function exportSite(request, env, corsOrigin) {
	if (!ready(env) || !env.SITES) return json({ error: 'export_unconfigured' }, 503, corsOrigin);
	const got = await requireUserSite(request, env);
	if (got.error) return json({ error: got.error }, got.status, corsOrigin);
	const site = got.site;

	const prefix = `${site.id}/`;
	const keys = [];
	let cursor;
	do {
		const page = await env.SITES.list({ prefix, cursor });
		keys.push(...page.objects.map((object) => object.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	if (!keys.length) return json({ error: 'nothing_published' }, 404, corsOrigin);

	const bucket = env.SITES;
	const stream = new ReadableStream({
		async start(controller) {
			const zip = new Zip((err, chunk, final) => {
				if (err) {
					controller.error(err);
					return;
				}
				controller.enqueue(chunk);
				if (final) controller.close();
			});
			try {
				for (const key of keys) {
					const object = await bucket.get(key);
					if (!object) continue;
					const entry = new ZipPassThrough(key.slice(prefix.length));
					zip.add(entry);
					entry.push(new Uint8Array(await object.arrayBuffer()), true);
				}
				zip.end();
			} catch (err) {
				controller.error(err);
			}
		},
	});

	const filename = `${site.subdomain || 'site'}-export.zip`;
	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Access-Control-Allow-Origin': corsOrigin,
			Vary: 'Origin',
		},
	});
}
