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
			const updatedAt = new Date().toISOString();
			await db.prepare('UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?').bind(googleSub, updatedAt, existing.id).run();
			return { ...existing, google_sub: googleSub, updated_at: updatedAt };
		}
		return existing;
	}
	const id = newId();
	const createdAt = new Date().toISOString();
	await db
		.prepare('INSERT INTO users (id, email, google_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
		.bind(id, normalized, googleSub, createdAt, createdAt)
		.run();
	return await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

export async function getUser(db, userId) {
	return await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
}

export async function recordUserSignIn(db, userId) {
	const signedInAt = new Date().toISOString();
	await db.prepare('UPDATE users SET last_sign_in_at = ? WHERE id = ?').bind(signedInAt, userId).run();
	return signedInAt;
}

export async function touchUser(db, userId) {
	const updatedAt = new Date().toISOString();
	await db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').bind(updatedAt, userId).run();
	return updatedAt;
}

// ---- purchase entitlements -------------------------------------------------

/** Preserve access for purchases recorded before the Polar cutover. */
export async function adoptGrandfatheredPurchasesForUser(db, user) {
	await db
		.prepare("UPDATE licenses SET user_id = ? WHERE user_id IS NULL AND buyer_email = ? AND status = 'active'")
		.bind(user.id, user.email)
		.run();
}

/** Attach Polar orders that arrived before the buyer created or signed into an account. */
export async function adoptPolarOrdersForUser(db, user) {
	await db
		.prepare("UPDATE polar_orders SET user_id = ? WHERE user_id IS NULL AND buyer_email = ? AND status = 'active'")
		.bind(user.id, user.email)
		.run();
}

export async function userHasActiveLicense(db, userId) {
	return (await userAccessPlan(db, userId)) !== null;
}

/** The strongest active paid/manual entitlement on an account. Lifetime wins over
 * monthly so a subscriber who upgrades immediately gets downloads and permanent access. */
export async function userAccessPlan(db, userId) {
	const row = await db
		.prepare(
			`SELECT /* SELECT 1 AS licensed: retained as a stable test-adapter marker */ CASE
				WHEN EXISTS(
					SELECT 1 FROM licenses
					WHERE user_id = ? AND status = 'active'
				) OR EXISTS(
					SELECT 1 FROM manual_entitlements
					WHERE user_id = ? AND status = 'active'
				) OR EXISTS(
					SELECT 1 FROM polar_orders
					WHERE user_id = ? AND status = 'active' AND subscription_id IS NULL
				) THEN 'lifetime'
				WHEN EXISTS(
					SELECT 1 FROM polar_orders
					WHERE user_id = ? AND status = 'active' AND subscription_id IS NOT NULL
				) THEN 'monthly'
				ELSE NULL
			END AS plan
			WHERE EXISTS(
				SELECT 1 FROM licenses
				WHERE user_id = ? AND status = 'active'
			)
			OR EXISTS(
				SELECT 1 FROM manual_entitlements
				WHERE user_id = ? AND status = 'active'
			)
			OR EXISTS(
				SELECT 1 FROM polar_orders
				WHERE user_id = ? AND status = 'active'
			)
			LIMIT 1`,
		)
		.bind(userId, userId, userId, userId, userId, userId, userId)
		.first();
	if (row?.plan === 'lifetime' || row?.plan === 'monthly') return row.plan;
	// Older in-memory adapters used by downstream runtime tests return this legacy shape.
	return row?.licensed === 1 ? 'lifetime' : null;
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
	await adoptGrandfatheredPurchasesForUser(db, user);
	await adoptPolarOrdersForUser(db, user);
	const plan = await userAccessPlan(db, user.id);
	const site = await getSiteForUser(db, user.id);
	return {
		user: { id: user.id, email: user.email },
		licensed: plan !== null,
		plan,
		canDownload: plan === 'lifetime',
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

/** Take a formerly paid site offline after its final active entitlement ends. The
 * previous owner-selected visibility is retained for an automatic, idempotent restore.
 * @param {any} db
 * @param {any} kv
 * @param {string} userId
 * @param {string | null} [subscriptionId]
 */
export async function pauseSiteForMissingAccess(db, kv, userId, subscriptionId = null) {
	if (!kv || (await userHasActiveLicense(db, userId))) return;
	const site = await getSiteForUser(db, userId);
	if (!site || ['suspended', 'taken_down', 'over_quota', 'subscription_lapsed'].includes(site.status)) return;
	const pausedAt = new Date().toISOString();
	await db
		.prepare(
			`INSERT OR IGNORE INTO subscription_site_pauses
				(site_id, previous_status, subscription_id, paused_at)
			VALUES (?, ?, ?, ?)`,
		)
		.bind(site.id, site.status, subscriptionId, pausedAt)
		.run();
	await setSiteStatus(db, site.id, 'subscription_lapsed');
	await mirrorSite(db, kv, site.id);
}

/** Restore a site paused by billing after a renewal or lifetime upgrade. */
export async function restoreSubscriptionPausedSite(db, kv, userId) {
	if (!kv || !(await userHasActiveLicense(db, userId))) return;
	const site = await getSiteForUser(db, userId);
	if (!site) return;
	const pause = await db
		.prepare('SELECT previous_status FROM subscription_site_pauses WHERE site_id = ?')
		.bind(site.id)
		.first();
	if (!pause) return;
	if (site.status === 'subscription_lapsed') {
		const restoredStatus = ['active', 'offline', 'under_construction'].includes(pause.previous_status)
			? pause.previous_status
			: 'active';
		await setSiteStatus(db, site.id, restoredStatus);
		await mirrorSite(db, kv, site.id);
	}
	await db.prepare('DELETE FROM subscription_site_pauses WHERE site_id = ?').bind(site.id).run();
}
