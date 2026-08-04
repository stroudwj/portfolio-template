-- Remember the owner's chosen visibility when paid access ends. The site is switched
-- to subscription_lapsed immediately, then restored to this state after a renewal or
-- lifetime upgrade. One row per site makes duplicate webhook deliveries idempotent.

CREATE TABLE subscription_site_pauses (
	site_id TEXT PRIMARY KEY REFERENCES sites(id),
	previous_status TEXT NOT NULL,
	subscription_id TEXT,
	paused_at TEXT NOT NULL
);
