import { z } from "zod";
import { MAX_SLOTS_PER_BOOKING, PROOF_ALLOWED_MIME, PROOF_MAX_BYTES } from "./constants";

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
  });

export type HoldsBody = z.infer<typeof holdsBodySchema>;

// POST /api/submit
export const submitBodySchema = z.object({
  holdTokens: z.array(z.string().min(16).max(128)).min(1).max(12),
  idempotencyKey: z.string().min(8).max(128),
  customer: z.object({
    fullName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(1).max(30),
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
