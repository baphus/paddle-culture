-- Data-only rename of the pricing time_band vocabulary (peak -> evening,
-- off-peak -> morning). Behavior/times/rates unchanged, only names.
-- Idempotent: safe to run on DBs already migrated (no-ops when old values
-- are gone). Schema untouched — snapshot carried over from 0001.
UPDATE "pricing_rules" SET "time_band" = 'evening' WHERE "time_band" = 'peak';--> statement-breakpoint
UPDATE "pricing_rules" SET "time_band" = 'morning' WHERE "time_band" = 'off-peak';
