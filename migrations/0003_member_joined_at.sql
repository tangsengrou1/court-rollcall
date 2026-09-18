-- Existing members have belonged to the team since the first recorded event.
ALTER TABLE members ADD COLUMN joined_at INTEGER NOT NULL DEFAULT 0;
