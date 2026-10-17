import { z } from "zod";
import { MAX_SLOTS_PER_BOOKING, PROOF_ALLOWED_MIME, PROOF_MAX_BYTES } from "./constants";
import { normalizePhone } from "./phone";
import {
  BOOKING_HORIZON_MONTHS,
  isWithinBookingHorizon,
} from "./slots";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const uuidStr = z.string().uuid();

const isoDateTime = z
  .string()
  .datetime({ offset: true, message: "must be an ISO-8601 datetime" });

// GET /api/availability?date=YYYY-MM-DD&courtId=<uuid>&courtId=<uuid>
export const availabilityQuerySchema = z.object({
  date: dateStr,
  courtIds: z.array(uuidStr).min(1).max(10),
});

// POST /api/holds — one hold row per (court, slot) pair (holds.hold_token
// is the PK, so a booking is an array of single-slot tokens sharing one
// deadline). Multi-court: pass `courtIds` to reserve the SAME slotStarts on
// every listed court. Single `courtId` still works (backwards compat);
// exactly one of the two forms must be present.
export const holdsBodySchema = z
  .object({
    courtId: uuidStr.optional(),
    courtIds: z.array(uuidStr).min(1).max(10).optional(),
    slotStarts: z.array(isoDateTime).min(1).max(MAX_SLOTS_PER_BOOKING),
  })
  .refine((d) => (d.courtId ? 1 : 0) + (d.courtIds ? 1 : 0) === 1, {
    message: "Provide either courtId or courtIds (exactly one).",
  })
  // Server-side copy of the client calendar's 12-month max date. The client
  // value is a hint; this is the rule.
  .refine(
    (d) => d.slotStarts.every((s) => isWithinBookingHorizon(new Date(s))),
    {
      message: `Bookings open up to ${BOOKING_HORIZON_MONTHS} months ahead.`,
    },
  );

export type HoldsBody = z.infer<typeof holdsBodySchema>;

// DELETE /api/holds — hold tokens are unguessable capability values, so the
// client can release only the exact rows it owns when navigating back.
export const releaseHoldsBodySchema = z.object({
  holdTokens: z.array(z.string().min(16).max(128)).min(1).max(MAX_SLOTS_PER_BOOKING),
});

// POST /api/submit
export const submitBodySchema = z.object({
  holdTokens: z.array(z.string().min(16).max(128)).min(1).max(12),
  idempotencyKey: z.string().min(8).max(128),
  customer: z.object({
    fullName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .min(1, "Enter a contact number.")
      .max(30)
      .transform(normalizePhone)
      .refine((v) => v.length > 0, "Enter a contact number."),
  }),
  rentals: z
    .object({
      paddleQty: z.number().int().min(0).max(50).default(0),
      // Upper bound of 12 mirrors MAX_SLOTS_PER_BOOKING; the tighter
      // cross-check (paddleHours <= booked slot count) is enforced in
      // recalculateTotal, which sees the real slot list from the holds.
      paddleHours: z.number().min(0).max(MAX_SLOTS_PER_BOOKING).nullable().optional(),
      ball: z.boolean().default(false),
    })
    .default({ paddleQty: 0, paddleHours: null, ball: false }),
  proof: z.object({
    path: z.string().min(1).max(500),
    mime: z.enum(PROOF_ALLOWED_MIME as unknown as [string, ...string[]]),
    bytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
  }),
});

export type SubmitBody = z.infer<typeof submitBodySchema>;

// POST /api/proofs/upload-url — customer-facing, unauthenticated. Minting is
// bound to live (unexpired) hold tokens so URLs cannot be farmed without a
// real hold/submit attempt.
export const proofUploadUrlBodySchema = z.object({
  holdTokens: z.array(z.string().min(16).max(128)).min(1).max(12),
  mime: z.enum(PROOF_ALLOWED_MIME as unknown as [string, ...string[]]),
  bytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
});

// ── Admin ───────────────────────────────────────────────────────────────────

// POST /api/admin/bookings — the admin picks slots straight off the live grid
// (no holds), so the body carries explicit (courtId, slotStart) pairs instead
// of hold tokens. It also carries the customer-identity mode:
//   notify ON  -> real contact details, customer gets the approved email
//   notify OFF -> fullName = free-text description, email/phone derived
//                 server-side from the admin session and the venue (Q13)
export const adminCreateBookingBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(128),
    notify: z.boolean().default(true),
    slots: z
      .array(
        z.object({
          courtId: uuidStr,
          slotStart: isoDateTime,
        }),
      )
      .min(1, "Pick at least one slot.")
      .max(MAX_SLOTS_PER_BOOKING),
    description: z.string().trim().min(1).max(100),
    customer: z
      .object({
        fullName: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(254),
        phone: z
          .string()
          .trim()
          .min(1, "Enter a contact number.")
          .max(30)
          .transform(normalizePhone)
          .refine((v) => v.length > 0, "Enter a contact number."),
      })
      .optional(),
    rentals: z
      .object({
        paddleQty: z.number().int().min(0).max(50).default(0),
        paddleHours: z.number().min(0).max(MAX_SLOTS_PER_BOOKING).nullable().optional(),
        ball: z.boolean().default(false),
      })
      .default({ paddleQty: 0, paddleHours: null, ball: false }),
    proof: z
      .object({
        path: z.string().min(1).max(500),
        mime: z.enum(PROOF_ALLOWED_MIME as unknown as [string, ...string[]]),
        bytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
      })
      .nullable()
      .optional(),
  })
  // Same 12-month horizon rule as the customer path (Q8).
  .refine(
    (d) => d.slots.every((s) => isWithinBookingHorizon(new Date(s.slotStart))),
    { message: `Bookings open up to ${BOOKING_HORIZON_MONTHS} months ahead.` },
  )
  .refine((d) => !d.notify || d.customer !== undefined, {
    message: "Customer details are required when notifying the customer.",
    path: ["customer"],
  })
  // One court/hour pair can only be booked once — a duplicated pair would
  // trip booking_slots_no_overlap_idx mid-transaction.
  .refine(
    (d) => new Set(d.slots.map((s) => `${s.courtId}@${s.slotStart}`)).size === d.slots.length,
    { message: "The same court and slot appears twice.", path: ["slots"] },
  );

export type AdminCreateBookingBody = z.infer<typeof adminCreateBookingBodySchema>;

// POST /api/admin/bookings/proof-upload-url — admin-gated, no hold tokens
// (there are no holds in the admin path). Q14.
export const adminProofUploadUrlBodySchema = z.object({
  mime: z.enum(PROOF_ALLOWED_MIME as unknown as [string, ...string[]]),
  bytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
});

export type AdminProofUploadUrlBody = z.infer<typeof adminProofUploadUrlBodySchema>;
