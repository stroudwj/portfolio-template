-- Track every renewal order back to its Polar subscription. When Polar revokes
-- the subscription benefit, all paid cycles are revoked together so an older
-- order cannot leave the account unlocked.

ALTER TABLE polar_orders ADD COLUMN subscription_id TEXT;

CREATE INDEX polar_orders_by_subscription ON polar_orders (subscription_id);
