// Publishing — authz + quota + manifest diff + uploads into R2 (Direction D, Subsystem 2).
//
// Three-step contract with CloudflareTarget in the editor:
//   1. POST /publish            { siteId?, subdomain?, manifest }  (Bearer)
//        → verify session, license (the server-side gate), site ownership, quotas;
//          diff against the site's last_manifest; answer with per-file upload tickets
//          for CHANGED files only + a signed "grant" over the exact manifest.
//   2. PUT  /upload?ticket=…    (raw file bytes)
//        → verify the ticket, size and content hash, then write {siteId}/{path} to R2.
//          The hash check is what makes manifest diffs trustworthy on later publishes.
//   3. POST /publish/complete   { grant }  (Bearer)
//        → delete removed objects, update D1 (bytes_used, last_manifest, timestamps)
//          and re-mirror KV. Answer { url }.
//
// The ticket/grant are HS256 JWTs signed with SESSION_SECRET (see lib/jwt.js), so a
// client can never upload outside its own site prefix, oversize a file, or "complete"
// a manifest that wasn't authorized. The browser uploads go straight to this Worker
// (R2 binding) — no S3 keys to provision, and the whole flow runs under
// `wrangler dev --local`, which presigned S3 URLs would not.

import { signJwt, verifyJwt } from './lib/jwt.js';
import { json, readJson } from './lib/http.js';
import { sessionUser } from './auth.js';
import { getSite, getSiteForUser, createSite, userHasActiveLicense, mirrorSite } from './lib/db.js';
import { claimSubdomainForSite } from './site.js';

// Mirrors the editor's MAX_BLOB_BYTES (github/target.ts kept 18 MB for GitHub blobs;
// the same ceiling holds here so bundles stay portable between targets).
export const MAX_BLOB_BYTES = 18 * 1024 * 1024;
const MAX_SITE_BYTES = 1024 * 1024 * 1024; // ~1 GB per site
const MAX_MANIFEST_FILES = 2000;
const MAX_PUBLISHES_PER_HOUR = 20;
const TICKET_TTL_S = 60 * 60;

// Content-type allowlist — static-site media only; executables/archives never land in R2.
const CONTENT_TYPES = {
	html: 'text/html; charset=utf-8',
	css: 'text/css; charset=utf-8',
	js: 'text/javascript; charset=utf-8',
	mjs: 'text/javascript; charset=utf-8',
	json: 'application/json; charset=utf-8',
	xml: 'application/xml',
	txt: 'text/plain; charset=utf-8',
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	ico: 'image/x-icon',
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	otf: 'font/otf',
	pdf: 'application/pdf',
	webmanifest: 'application/manifest+json',
};

export function contentTypeFor(path) {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	return CONTENT_TYPES[ext] ?? null;
}

/** One published path: relative, no traversal, no hidden tricks, allowlisted type. */
function isSafePath(path) {
	if (typeof path !== 'string' || !path || path.length > 512) return false;
	// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
	if (path.includes('\\') || /[\u0000-\u001f]/.test(path)) return false;
	const segments = path.split('/');
	if (segments.some((s) => !s || s === '.' || s === '..')) return false;
	return contentTypeFor(path) !== null;
}

function isHash(value) {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

async function sha256Hex(bytes) {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable digest of a manifest so /publish/complete applies exactly what was granted. */
async function manifestDigest(manifest) {
	const canonical = Object.keys(manifest)
		.sort()
		.map((path) => `${path}\n${manifest[path].hash}\n${manifest[path].size}`)
		.join('\n');
	return sha256Hex(new TextEncoder().encode(canonical));
}

function parseStoredManifest(site) {
	try {
		return site?.last_manifest ? JSON.parse(site.last_manifest) : {};
	} catch {
		return {};
	}
}

/** Coarse per-account publish damper (KV; approximate is fine for abuse-blunting). */
async function publishRateLimited(kv, userId) {
	const key = `pubrate:${userId}`;
	const count = Number((await kv.get(key)) ?? '0');
	if (count >= MAX_PUBLISHES_PER_HOUR) return true;
	await kv.put(key, String(count + 1), { expirationTtl: 3600 });
	return false;
}

const ready = (env) => env.SESSION_SECRET && env.DB && env.KV && env.SITES;

// ---- POST /publish ---------------------------------------------------------

export async function publish(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'publishing_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);

	// The gate: publishing requires an active license on the ACCOUNT (server-side,
	// D1-backed — the client-side gate is only ever a convenience mirror of this).
	if (!(await userHasActiveLicense(env.DB, user.id))) return json({ error: 'license_required' }, 402, corsOrigin);

	const body = await readJson(request);
	if (!body || typeof body.manifest !== 'object' || body.manifest === null) {
		return json({ error: 'invalid_manifest' }, 400, corsOrigin);
	}

	// Validate the manifest shape and totals before touching any state.
	const manifest = {};
	const entries = Object.entries(body.manifest);
	if (entries.length === 0 || entries.length > MAX_MANIFEST_FILES) {
		return json({ error: 'invalid_manifest' }, 400, corsOrigin);
	}
	let totalBytes = 0;
	for (const [path, meta] of entries) {
		const size = meta?.size;
		if (!isSafePath(path) || !isHash(meta?.hash) || !Number.isInteger(size) || size < 0) {
			return json({ error: 'invalid_manifest', path }, 400, corsOrigin);
		}
		if (size > MAX_BLOB_BYTES) return json({ error: 'file_too_large', path, max: MAX_BLOB_BYTES }, 413, corsOrigin);
		totalBytes += size;
		manifest[path] = { hash: meta.hash, size };
	}
	if (totalBytes > MAX_SITE_BYTES) return json({ error: 'over_quota', max: MAX_SITE_BYTES }, 413, corsOrigin);

	if (await publishRateLimited(env.KV, user.id)) return json({ error: 'rate_limited' }, 429, corsOrigin);

	// Resolve the site: the caller's saved siteId, else their existing site, else a new
	// row. The ownership check is the boundary GitHub's PAT scoping used to give us.
	let site = null;
	if (typeof body.siteId === 'string' && body.siteId) {
		site = await getSite(env.DB, body.siteId);
		if (!site) return json({ error: 'site_not_found' }, 404, corsOrigin);
		if (site.user_id !== user.id) return json({ error: 'forbidden' }, 403, corsOrigin);
	} else {
		site = (await getSiteForUser(env.DB, user.id)) ?? (await createSite(env.DB, user.id));
	}
	if (site.status === 'taken_down' || site.status === 'suspended') {
		return json({ error: 'site_' + site.status }, 451, corsOrigin);
	}

	// First publish may claim the site's default address in the same call.
	if (!site.subdomain && typeof body.subdomain === 'string' && body.subdomain) {
		const claim = await claimSubdomainForSite(env, site, body.subdomain);
		if (claim.error) return json({ error: claim.error }, claim.status, corsOrigin);
		site = await getSite(env.DB, site.id);
	}
	if (!site.subdomain) return json({ error: 'subdomain_required' }, 400, corsOrigin);

	// Diff: upload only what changed since the last successful publish.
	const previous = parseStoredManifest(site);
	const changed = Object.keys(manifest).filter((path) => previous[path]?.hash !== manifest[path].hash);
	const deleted = Object.keys(previous).filter((path) => !(path in manifest));

	const now = Math.floor(Date.now() / 1000);
	const uploads = await Promise.all(
		changed.map(async (path) => ({
			path,
			ticket: await signJwt(
				{ t: 'up', s: site.id, p: path, h: manifest[path].hash, n: manifest[path].size, exp: now + TICKET_TTL_S },
				env.SESSION_SECRET,
			),
		})),
	);
	const grant = await signJwt(
		{ t: 'grant', s: site.id, u: user.id, mh: await manifestDigest(manifest), b: totalBytes, exp: now + TICKET_TTL_S },
		env.SESSION_SECRET,
	);

	return json(
		{
			siteId: site.id,
			subdomain: site.subdomain,
			url: `https://${site.subdomain}.${env.SITES_ROOT_DOMAIN}`,
			uploads,
			deleted,
			grant,
		},
		200,
		corsOrigin,
	);
}

// ---- PUT /upload?ticket=… --------------------------------------------------

export async function upload(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'publishing_unconfigured' }, 503, corsOrigin);
	const ticket = new URL(request.url).searchParams.get('ticket') ?? '';
	const claims = await verifyJwt(ticket, env.SESSION_SECRET);
	if (!claims || claims.t !== 'up' || !isSafePath(claims.p)) return json({ error: 'invalid_ticket' }, 401, corsOrigin);

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.length > MAX_BLOB_BYTES || bytes.length > claims.n) {
		return json({ error: 'file_too_large', max: Math.min(MAX_BLOB_BYTES, claims.n) }, 413, corsOrigin);
	}
	// The declared hash is enforced here — later manifest diffs depend on it being true.
	if ((await sha256Hex(bytes)) !== claims.h) return json({ error: 'hash_mismatch' }, 400, corsOrigin);

	await env.SITES.put(`${claims.s}/${claims.p}`, bytes, {
		httpMetadata: { contentType: contentTypeFor(claims.p) ?? 'application/octet-stream' },
	});
	return json({ stored: true, path: claims.p }, 200, corsOrigin);
}

// ---- POST /publish/complete ------------------------------------------------

export async function publishComplete(request, env, corsOrigin) {
	if (!ready(env)) return json({ error: 'publishing_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);

	const body = await readJson(request);
	const grant = await verifyJwt(typeof body?.grant === 'string' ? body.grant : '', env.SESSION_SECRET);
	if (!grant || grant.t !== 'grant' || grant.u !== user.id) return json({ error: 'invalid_grant' }, 401, corsOrigin);
	if (typeof body.manifest !== 'object' || body.manifest === null) return json({ error: 'invalid_manifest' }, 400, corsOrigin);
	// The grant pins the exact manifest authorized by /publish — no substitutions.
	if ((await manifestDigest(body.manifest)) !== grant.mh) return json({ error: 'manifest_mismatch' }, 400, corsOrigin);

	const site = await getSite(env.DB, grant.s);
	if (!site || site.user_id !== user.id) return json({ error: 'forbidden' }, 403, corsOrigin);

	// Remove what the new manifest no longer references.
	const previous = parseStoredManifest(site);
	const removed = Object.keys(previous).filter((path) => !(path in body.manifest));
	if (removed.length) await env.SITES.delete(removed.map((path) => `${site.id}/${path}`));

	await env.DB.prepare('UPDATE sites SET bytes_used = ?, last_published_at = ?, last_manifest = ? WHERE id = ?')
		.bind(grant.b, new Date().toISOString(), JSON.stringify(body.manifest), site.id)
		.run();
	await mirrorSite(env.DB, env.KV, site.id);

	return json(
		{ url: `https://${site.subdomain}.${env.SITES_ROOT_DOMAIN}`, siteId: site.id, subdomain: site.subdomain },
		200,
		corsOrigin,
	);
}
