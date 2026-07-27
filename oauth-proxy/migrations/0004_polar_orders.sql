-- Polar purchase ledger. Polar runs alongside Lemon Squeezy during merchant review,
-- so provider-native ids stay in their own table while both grant the same account
-- publishing entitlement.

CREATE TABLE polar_orders (
	id TEXT PRIMARY KEY, -- Polar order UUID
	user_id TEXT REFERENCES users(id),
	polar_customer_id TEXT,
	checkout_id TEXT,
	product_id TEXT NOT NULL,
	buyer_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active', -- active | refunded | revoked
	paid_at TEXT,
	created_at TEXT NOT NULL
);

CREATE INDEX polar_orders_by_user ON polar_orders (user_id, created_at);
CREATE INDEX polar_orders_by_buyer_email ON polar_orders (buyer_email);
CREATE INDEX polar_orders_by_checkout ON polar_orders (checkout_id);
