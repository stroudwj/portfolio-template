-- Activity timestamps used by the paginated operator account directory.
--
-- Historical sign-ins cannot be reconstructed, so last_sign_in_at starts NULL and is
-- populated on the next successful magic-link or Google sign-in. updated_at is
-- backfilled from account creation, then touched by identity/license/admin changes.

ALTER TABLE users ADD COLUMN last_sign_in_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

UPDATE users
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX users_by_last_sign_in ON users (last_sign_in_at DESC);
CREATE INDEX users_by_updated ON users (updated_at DESC);
