// D1 (source of truth) + KV (serving hot-path mirror) helpers.
//
// Every routing-relevant change — publish, subdomain claim, custom hostname, status
// flip — funnels through mirrorSite()/mirrorHostname() so the serving Worker's single
// KV lookup can never drift from D1 for longer than one write.

export function newId() {
	return crypto.randomUUID().replace(/-/g, '');
}

// ---- users -----------------------------------------------------------------

/** Find-or-create a user by email; optionally attach the Google subject on the way. */
export async function upsertUserByEmail(db, email, googleSub = null) {
	const normalized = email.trim().toLowerCase();
	const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(normalized).first();
	if (existing) {
		if (googleSub && existing.google_sub !== googleSub) {
			await db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(googleSub, existing.id).run();
			return { ...existing, google_sub: googleSub };
		}
		return existing;
	}
	const id = newId();
	await db
		.prepare('INSERT INTO users (id, email, google_sub) VALUES (?, ?, ?)')
		.bind(id, normalized, googleSub)
		.run();
	return await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

export async function getUser(db, userId) {
	return await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
}

// ---- licenses --------------------------------------------------------------

/** Attach any webhook-created (user_id IS NULL) licenses whose buyer email matches. */
export async function adoptLicensesForUser(db, user) {
	await db
		.prepare("UPDATE licenses SET user_id = ? WHERE user_id IS NULL AND buyer_email = ? AND status = 'active'")
		.bind(user.id, user.email)
		.run();
}

export async function userHasActiveLicense(db, userId) {
	const row = await db
		.prepare("SELECT id FROM licenses WHERE user_id = ? AND status = 'active' LIMIT 1")
		.bind(userId)
		.first();
	return row != null;
}

// ---- sites -----------------------------------------------------------------

export async function getSite(db, siteId) {
	return await db.prepare('SELECT * FROM sites WHERE id = ?').bind(siteId).first();
}

export async function getSiteForUser(db, userId) {
	return await db.prepare('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at LIMIT 1').bind(userId).first();
}

export async function createSite(db, userId) {
	const id = newId();
	await db.prepare('INSERT INTO sites (id, user_id) VALUES (?, ?)').bind(id, userId).run();
	return await getSite(db, id);
}

/** Flip a site's status (active | offline | under_construction | suspended | …). */
export async function setSiteStatus(db, siteId, status) {
	await db.prepare('UPDATE sites SET status = ? WHERE id = ?').bind(status, siteId).run();
}

/** Every hostname (subdomain + custom) routed to a site, with its kind. */
export async function listHostnames(db, siteId) {
	const { results } = await db.prepare('SELECT hostname, kind FROM hostnames WHERE site_id = ?').bind(siteId).all();
	return results ?? [];
}

/** Delete a site and its hostname rows (D1). Callers purge R2/KV/edge separately. */
export async function deleteSiteRows(db, siteId) {
	await db.prepare('DELETE FROM hostnames WHERE site_id = ?').bind(siteId).run();
	await db.prepare('DELETE FROM sites WHERE id = ?').bind(siteId).run();
}

/** Summarize a user's account for the editor (used by /auth/session). */
export async function accountSummary(db, user) {
	await adoptLicensesForUser(db, user);
	const licensed = await userHasActiveLicense(db, user.id);
	const site = await getSiteForUser(db, user.id);
	return {
		user: { id: user.id, email: user.email },
		licensed,
		site: site
			? {
					siteId: site.id,
					subdomain: site.subdomain,
					status: site.status,
					lastPublishedAt: site.last_published_at,
				}
			: null,
	};
}

// ---- KV mirror (hostname → { siteId, status }) ------------------------------

const HOST_PREFIX = 'host:';

export async function mirrorHostname(kv, hostname, siteId, status) {
	await kv.put(HOST_PREFIX + hostname.toLowerCase(), JSON.stringify({ siteId, status }));
}

export async function dropHostname(kv, hostname) {
	await kv.delete(HOST_PREFIX + hostname.toLowerCase());
}

/** Re-mirror every hostname of a site (called after any site status/routing change). */
export async function mirrorSite(db, kv, siteId) {
	const site = await getSite(db, siteId);
	if (!site) return;
	const { results } = await db.prepare('SELECT hostname FROM hostnames WHERE site_id = ?').bind(siteId).all();
	await Promise.all((results ?? []).map((row) => mirrorHostname(kv, row.hostname, site.id, site.status)));
}
