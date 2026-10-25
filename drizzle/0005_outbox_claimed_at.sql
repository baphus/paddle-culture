-- Add email_outbox.claimed_at: when a worker last took the row (status
-- 'sending').
--
-- WHY THIS COLUMN EXISTS
-- rpc_claim_outbox_batch flips rows to 'sending' before handing them to the
-- mailer, and only ever selects 'pending'/'retry'. A process that dies
-- mid-batch — Vercel function timeout, a deploy, an OOM — leaves its claims in
-- 'sending' permanently: the mail never went out and nothing retries it, so the
-- customer never receives their confirmation and never knows why. There was no
-- column to tell a live claim from an abandoned one, so the claim function now
-- reclaims 'sending' rows older than 15 minutes, which needs this timestamp.
--
-- Existing 'sending' rows get a stamp of now() so the sweep gives them a full
-- grace window before touching them.

ALTER TABLE "email_outbox" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint

UPDATE "email_outbox" SET "claimed_at" = now() WHERE "status" = 'sending';--> statement-breakpoint

-- The sweep looks up stale claims by status + claimed_at.
CREATE INDEX "email_outbox_sending_idx" ON "email_outbox" ("claimed_at") WHERE "status" = 'sending';
