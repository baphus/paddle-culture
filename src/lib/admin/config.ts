import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, closures, courts, operatingHours, pricingRules } from "@/db/schema";
import { LaneError } from "@/lib/booking/errors";
import type { AdminSession } from "./session";

// Admin configuration lane (courts / pricing / hours / closures).
// Every mutation writes an audit_log row (actor = admin email) in the same
// call. Pricing edits are VALUES ONLY: no new rule kinds, no deletes — the
// vocabulary (day_type / time_band / item_type / unit) is owned by the
// pricing lane and mirrored read-only here.

function audit(
  admin: AdminSession,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  return { actor: admin.email, action, entity, entityId, before, after };
}

// --- Courts ---------------------------------------------------------------

export const courtCreateSchema = z.object({
  name: z.string().trim().min(1, "Court name is required.").max(100),
});

export const COURT_STATUSES = ["active", "inactive"] as const;

export const courtStatusSchema = z.object({
  status: z.enum(COURT_STATUSES),
});

export interface CourtRow {
  id: string;
  name: string;
  status: string;
}

export async function listCourts(db: Db): Promise<CourtRow[]> {
  return db
    .select({ id: courts.id, name: courts.name, status: courts.status })
    .from(courts)
    .orderBy(asc(courts.name));
}

export async function createCourt(
  db: Db,
  admin: AdminSession,
  name: string,
): Promise<CourtRow> {
  const inserted = await db
    .insert(courts)
    .values({ name, status: "active" })
    .returning({ id: courts.id, name: courts.name, status: courts.status });
  const row = inserted[0];
  if (!row) throw new LaneError("INTERNAL", "Court creation failed.", 500);
  await db.insert(auditLog).values([
    audit(admin, "court.create", "court", row.id, null, {
      name: row.name,
      status: row.status,
    }),
  ]);
  return row;
}

export async function setCourtStatus(
  db: Db,
  admin: AdminSession,
  id: string,
  status: "active" | "inactive",
): Promise<CourtRow> {
  const existing = await db.select().from(courts).where(eq(courts.id, id));
  const court = existing[0];
  if (!court) throw new LaneError("NOT_FOUND", "Court not found.", 404);
  if (court.status === status) return court;
  const updated = await db
    .update(courts)
    .set({ status })
    .where(eq(courts.id, id))
    .returning({ id: courts.id, name: courts.name, status: courts.status });
  const row = updated[0];
  if (!row) throw new LaneError("INTERNAL", "Court update failed.", 500);
  await db.insert(auditLog).values([
    audit(admin, "court.status", "court", row.id, { status: court.status }, { status }),
  ]);
  return row;
}

// --- Pricing (values only) ---------------------------------------------------

export const pricingAmountSchema = z.object({
  // numeric(12,2): positive pesos with at most 2 decimals.
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a peso value like 150 or 150.50.")
    .refine((s) => Number(s) > 0 && Number(s) <= 9999999999.99, {
      message: "Amount must be above 0.",
    }),
});

export interface PricingRuleRow {
  id: string;
  courtId: string | null;
  courtName: string;
  dayType: string;
  timeBand: string;
  itemType: string;
  unit: string;
  amount: string;
}

export async function listPricingRules(db: Db): Promise<PricingRuleRow[]> {
  const rules = await db
    .select()
    .from(pricingRules)
    .orderBy(asc(pricingRules.itemType), asc(pricingRules.dayType));
  const courtRows = await db.select({ id: courts.id, name: courts.name }).from(courts);
  const names = new Map(courtRows.map((c) => [c.id, c.name]));
  return rules.map((r) => ({
    id: r.id,
    courtId: r.courtId,
    courtName: r.courtId ? (names.get(r.courtId) ?? "(deleted court)") : "All courts (global)",
    dayType: r.dayType,
    timeBand: r.timeBand,
    itemType: r.itemType,
    unit: r.unit,
    amount: r.amount,
  }));
}

export async function updatePricingAmount(
  db: Db,
  admin: AdminSession,
  id: string,
  amount: string,
): Promise<PricingRuleRow> {
  const existing = await db.select().from(pricingRules).where(eq(pricingRules.id, id));
  const rule = existing[0];
  if (!rule) throw new LaneError("NOT_FOUND", "Pricing rule not found.", 404);
  if (rule.amount === amount) {
    const [row] = await listPricingRules(db).then((rows) =>
      rows.filter((r) => r.id === id),
    );
    if (!row) throw new LaneError("INTERNAL", "Pricing rule unreadable.", 500);
    return row;
  }
  await db.update(pricingRules).set({ amount }).where(eq(pricingRules.id, id));
  await db.insert(auditLog).values([
    audit(
      admin,
      "pricing.update",
      "pricing_rule",
      id,
      { amount: rule.amount },
      { amount },
    ),
  ]);
  const [row] = await listPricingRules(db).then((rows) =>
    rows.filter((r) => r.id === id),
  );
  if (!row) throw new LaneError("INTERNAL", "Pricing rule unreadable.", 500);
  return row;
}

// --- Operating hours -----------------------------------------------------------
// NOTE: hours.ts:isSlotOpen defaults a slot to OPEN when a court has zero
// configured rows (today + overnight spill). The hours page surfaces this
// with a banner; this lane only makes rows visible/editable, it does not
// change the default.

export const DAY_NAMES: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24h).");

export const hoursCreateSchema = z
  .object({
    courtId: z.string().uuid().nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: hhmm,
    closeTime: hhmm,
  })
  .refine((d) => d.openTime !== d.closeTime, {
    message: "Open and close times must differ (use overnight close<=open for late nights).",
  });

export interface HoursRow {
  id: string;
  courtId: string | null;
  courtName: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export function toDbTime(hhmmValue: string): string {
  return `${hhmmValue}:00`;
}

export function shortTime(dbTime: string): string {
  return dbTime.slice(0, 5);
}

export async function listHours(db: Db): Promise<HoursRow[]> {
  const rows = await db.select().from(operatingHours).orderBy(asc(operatingHours.dayOfWeek));
  const courtRows = await db.select({ id: courts.id, name: courts.name }).from(courts);
  const names = new Map(courtRows.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    courtId: r.courtId,
    courtName: r.courtId ? (names.get(r.courtId) ?? "(deleted court)") : "All courts (global)",
    dayOfWeek: r.dayOfWeek,
    openTime: shortTime(r.openTime),
    closeTime: shortTime(r.closeTime),
  }));
}

export async function createHours(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof hoursCreateSchema>,
): Promise<HoursRow> {
  if (input.courtId) {
    const c = await db.select({ id: courts.id }).from(courts).where(eq(courts.id, input.courtId));
    if (!c[0]) throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
  }
  const inserted = await db
    .insert(operatingHours)
    .values({
      courtId: input.courtId,
      dayOfWeek: input.dayOfWeek,
      openTime: toDbTime(input.openTime),
      closeTime: toDbTime(input.closeTime),
    })
    .returning({ id: operatingHours.id });
  const id = inserted[0]?.id;
  if (!id) throw new LaneError("INTERNAL", "Hours creation failed.", 500);
  await db.insert(auditLog).values([audit(admin, "hours.create", "operating_hours", id, null, input)]);
  const [row] = await listHours(db).then((rows) => rows.filter((r) => r.id === id));
  if (!row) throw new LaneError("INTERNAL", "Hours row unreadable.", 500);
  return row;
}

export async function deleteHours(db: Db, admin: AdminSession, id: string): Promise<void> {
  const existing = await db.select().from(operatingHours).where(eq(operatingHours.id, id));
  const row = existing[0];
  if (!row) throw new LaneError("NOT_FOUND", "Hours row not found.", 404);
  await db.delete(operatingHours).where(eq(operatingHours.id, id));
  await db.insert(auditLog).values([
    audit(admin, "hours.delete", "operating_hours", id, row, null),
  ]);
}

// --- Closures ------------------------------------------------------------------

export const closureCreateSchema = z
  .object({
    scope: z.enum(["global", "court"]),
    courtId: z.string().uuid().nullable(),
    startAt: z.string().datetime({ offset: true, message: "startAt must be ISO-8601." }),
    endAt: z.string().datetime({ offset: true, message: "endAt must be ISO-8601." }),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => new Date(d.endAt).getTime() > new Date(d.startAt).getTime(), {
    message: "endAt must be after startAt.",
  })
  .refine((d) => d.scope === "global" || d.courtId !== null, {
    message: "Court closures need a courtId.",
  });

export interface ClosureRow {
  id: string;
  scope: string;
  courtId: string | null;
  courtName: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  by: string | null;
}

export async function listClosures(db: Db): Promise<ClosureRow[]> {
  const rows = await db.select().from(closures).orderBy(asc(closures.startAt));
  const courtRows = await db.select({ id: courts.id, name: courts.name }).from(courts);
  const names = new Map(courtRows.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    courtId: r.courtId,
    courtName:
      r.scope === "global" ? "All courts" : (r.courtId ? names.get(r.courtId) : null) ?? "(deleted court)",
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    reason: r.reason,
    by: r.by,
  }));
}

export async function createClosure(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof closureCreateSchema>,
): Promise<ClosureRow> {
  const courtId = input.scope === "global" ? null : input.courtId;
  if (courtId) {
    const c = await db.select({ id: courts.id }).from(courts).where(eq(courts.id, courtId));
    if (!c[0]) throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
  }
  const inserted = await db
    .insert(closures)
    .values({
      scope: input.scope,
      courtId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      reason: input.reason ?? null,
      by: admin.email,
    })
    .returning({ id: closures.id });
  const id = inserted[0]?.id;
  if (!id) throw new LaneError("INTERNAL", "Closure creation failed.", 500);
  await db.insert(auditLog).values([
    audit(admin, "closure.create", "closure", id, null, { ...input, by: admin.email }),
  ]);
  const [row] = await listClosures(db).then((rows) => rows.filter((r) => r.id === id));
  if (!row) throw new LaneError("INTERNAL", "Closure unreadable.", 500);
  return row;
}

export async function deleteClosure(db: Db, admin: AdminSession, id: string): Promise<void> {
  const existing = await db.select().from(closures).where(eq(closures.id, id));
  const row = existing[0];
  if (!row) throw new LaneError("NOT_FOUND", "Closure not found.", 404);
  await db.delete(closures).where(eq(closures.id, id));
  await db.insert(auditLog).values([
    audit(admin, "closure.delete", "closure", id, row, null),
  ]);
}
