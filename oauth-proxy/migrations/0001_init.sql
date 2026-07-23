-- Hangwork accounts + hosting — D1 schema (source of truth; KV mirrors the serving hot path).
--
-- Apply locally:  wrangler d1 migrations apply hangwork --local
-- Apply live:     wrangler d1 migrations apply hangwork --remote
--
-- Design notes (see the Direction D plan):
--  * users are passwordless — identity is an email (magic link) and/or a Google subject.
--  * licenses arrive two ways: the Lemon Squeezy webhook (matched by buyer email, user_id
--    may be NULL until that person signs in) or an explicit bind from the editor redirect.
--  * sites.id is a stable opaque id (never the subdomain) and doubles as the R2 key prefix,
--    so renames and custom domains are one-row edits that never touch stored objects.
--  * hostnames maps BOTH jane.hangwork.art and jane.com to a site; it is the enforcement
--    surface (status lives on the site row) and is mirrored to KV on every change.

CREATE TABLE users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	google_sub TEXT UNIQUE,
	ls_customer_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE licenses (
	id TEXT PRIMARY KEY,
	-- NULL until the buyer signs in (webhook can land before the account exists).
	user_id TEXT REFERENCES users(id),
	ls_license_key TEXT UNIQUE,
	ls_order_id TEXT UNIQUE,
	-- The email on the purchase; how a webhook-created license finds its account later.
	buyer_email TEXT,
	status TEXT NOT NULL DEFAULT 'active', -- active | refunded
	activated_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX licenses_by_user ON licenses (user_id);
CREATE INDEX licenses_by_buyer_email ON licenses (buyer_email);

CREATE TABLE sites (
	id TEXT PRIMARY KEY, -- opaque, stable; the R2 object-key prefix
	user_id TEXT NOT NULL REFERENCES users(id),
	subdomain TEXT UNIQUE,
	status TEXT NOT NULL DEFAULT 'active', -- active | suspended | taken_down | over_quota
	bytes_used INTEGER NOT NULL DEFAULT 0,
	req_count_period INTEGER NOT NULL DEFAULT 0,
	last_published_at TEXT,
	-- JSON { "path": { "hash": "…", "size": n } } — the file set the last publish wrote.
	last_manifest TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sites_by_user ON sites (user_id);

CREATE TABLE hostnames (
	hostname TEXT PRIMARY KEY,
	site_id TEXT NOT NULL REFERENCES sites(id),
	-- 'subdomain' (ours, under hangwork.art) or 'custom' (Cloudflare for SaaS hostname).
	kind TEXT NOT NULL DEFAULT 'subdomain',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX hostnames_by_site ON hostnames (site_id);
