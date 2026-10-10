// Holds + submit lane constants (ADR-02 / ADR-03).
export const MANILA_TZ = "Asia/Manila";

// Operating day 06:00 → 03:00+1d Manila = 21 one-hour slots, index 0..20.
// Selection date = start date; midnight crossing handled as datetime ranges.
export const DAY_START_HOUR_MANILA = 6;
export const SLOT_COUNT = 21;
export const MAX_SLOTS_PER_BOOKING = 12;

// Hold time-to-live (ADR-03: countdown cosmetic client-side, server enforces
// expires_at > now() on every read).
export const HOLD_TTL_MINUTES = 10;

// Payment-proof hard gate (ADR-02, frozen).
export const PROOF_BUCKET = "proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

// All customer-minted upload paths live under this prefix: `incoming/<32hex>.<ext>`.
// The submit hard gate rejects any proof path outside it, so a submit can
// never reference another booking's file or an arbitrary bucket object.
export const PROOF_INCOMING_PREFIX = "incoming/";

// Signed admin read URLs (view/zoom/download) live 5 minutes.
export const PROOF_READ_TTL_SECONDS = 300;

// Outbox templates written by the submit transaction (ADR-05: customer
// submission email + owner alert; the approve/reject email is written by the
// admin-decision lane, not here).
export const OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED = "booking_customer_submitted";
export const OUTBOX_TEMPLATE_OWNER_ALERT = "booking_owner_alert";
export const OWNER_ALERT_EMAIL = "ckgrounds1@gmail.com";

// Booking slot states considered "live" for overlap + availability. No writer
// produces "held" (rpc_submit_booking writes "pending"; rpc_apply_decision
// flips it to approved/rejected), so it is not listed here.
// The DB side is deliberately wider: the booking_slots_no_overlap_idx partial
// unique index in src/db/schema.ts:159 and rpc_submit_booking
// (supabase/rpc-functions.sql:299) still include 'held' so any legacy row
// cannot be overlapped. If you ever drop 'held' from the DB, keep them in
// lockstep.
export const LIVE_SLOT_STATES = ["pending", "approved"] as const;
