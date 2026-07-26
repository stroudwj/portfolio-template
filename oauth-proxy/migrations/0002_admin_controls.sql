-- Audited operator controls: complimentary access plus reversible site suspensions.
--
-- Paid Lemon Squeezy licenses remain immutable purchase records. Manual access lives in
-- its own ledger, and suspension remembers the site's prior owner-selected visibility
-- so restoration does not unexpectedly publish an offline site.

CREATE TABLE manual_entitlements (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id),
	status TEXT NOT NULL DEFAULT 'active', -- active | revoked
	reason TEXT NOT NULL,
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at TEXT NOT NULL,
	revoked_by_user_id TEXT REFERENCES users(id),
	revoked_reason TEXT,
	revoked_at TEXT
);
CREATE INDEX manual_entitlements_by_user ON manual_entitlements (user_id, created_at);
CREATE UNIQUE INDEX one_active_manual_entitlement_per_user
	ON manual_entitlements (user_id)
	WHERE status = 'active';

CREATE TABLE site_suspensions (
	id TEXT PRIMARY KEY,
	site_id TEXT NOT NULL REFERENCES sites(id),
	previous_status TEXT NOT NULL,
	reason TEXT NOT NULL,
	suspended_by_user_id TEXT NOT NULL REFERENCES users(id),
	suspended_at TEXT NOT NULL,
	restored_by_user_id TEXT REFERENCES users(id),
	restore_reason TEXT,
	restored_at TEXT
);
CREATE INDEX site_suspensions_by_site ON site_suspensions (site_id, suspended_at);
CREATE UNIQUE INDEX one_active_suspension_per_site
	ON site_suspensions (site_id)
	WHERE restored_at IS NULL;

CREATE TABLE admin_audit_log (
	id TEXT PRIMARY KEY,
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	actor_email TEXT NOT NULL,
	action TEXT NOT NULL,
	target_user_id TEXT REFERENCES users(id),
	target_site_id TEXT REFERENCES sites(id),
	reason TEXT NOT NULL,
	before_json TEXT,
	after_json TEXT,
	created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_by_target_user ON admin_audit_log (target_user_id, created_at);
CREATE INDEX admin_audit_by_target_site ON admin_audit_log (target_site_id, created_at);
