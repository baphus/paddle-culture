import { z } from "zod";
import type { Db } from "@/db/client";
import { LaneError } from "@/lib/booking/errors";
import { dayName, windowLabel } from "@/lib/booking/windows";
import type { AdminSession } from "./session";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

function audit(
  admin: AdminSession,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  return { actor: admin.email, action, entity, entity_id: entityId, before, after };
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
  const { data, error } = await db
    .from("courts")
    .select("id,name,status")
    .order("name", { ascending: true });
  if (error) throw new LaneError("DB_ERROR", error.message, 500);
  return (data ?? []) as CourtRow[];
}

export async function createCourt(
  db: Db,
  admin: AdminSession,
  name: string,
): Promise<CourtRow> {
  const { data, error } = await db
    .from("courts")
    .insert({ name, status: "active" })
    .select("id,name,status")
    .single();
  if (error) throw new LaneError("DB_ERROR", error.message, 500);
  const row = data as CourtRow;
  await db.from("audit_log").insert([
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
  const { data: existing, error: fetchError } = await db
    .from("courts")
    .select("id,name,status")
    .eq("id", id)
    .single();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Court not found.", 404);
  const court = existing as CourtRow;
  if (court.status === status) return court;

  const { data: updated, error: updateError } = await db
    .from("courts")
    .update({ status })
    .eq("id", id)
    .select("id,name,status")
    .single();
  if (updateError || !updated) throw new LaneError("INTERNAL", "Court update failed.", 500);
  const row = updated as CourtRow;
  await db.from("audit_log").insert([
    audit(admin, "court.status", "court", row.id, { status: court.status }, { status }),
  ]);
  return row;
}

// --- Pricing (values only) ---------------------------------------------------

// Fixed vocabulary. Mirrors the seed's rate card + pickRule() fallback keys in
// src/lib/booking/pricing.ts and the `time_band` / `day_type` values in slots.ts.
export const PRICING_DAY_TYPES = ["weekday", "weekend", "holiday", "all"] as const;
export const PRICING_TIME_BANDS = ["morning", "evening", "all"] as const;
export const PRICING_ITEM_TYPES = ["court", "paddle", "ball"] as const;
export const PRICING_UNITS = ["slot", "hour", "flat"] as const;

export const pricingAmountSchema = z.object({
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
  const { data: rules, error: rulesError } = await db
    .from("pricing_rules")
    .select("id,court_id,day_type,time_band,item_type,unit,amount")
    .order("item_type", { ascending: true })
    .order("day_type", { ascending: true });
  if (rulesError) throw new LaneError("DB_ERROR", rulesError.message, 500);

  const { data: courtRows, error: courtError } = await db
    .from("courts")
    .select("id,name");
  if (courtError) throw new LaneError("DB_ERROR", courtError.message, 500);

  const names = new Map((courtRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  return (rules ?? []).map((r: {
    id: string; court_id: string | null; day_type: string;
    time_band: string; item_type: string; unit: string; amount: string | number;
  }) => ({
    id: r.id,
    courtId: r.court_id,
    courtName: r.court_id ? (names.get(r.court_id) ?? "(deleted court)") : "All courts (global)",
    dayType: r.day_type,
    timeBand: r.time_band,
    itemType: r.item_type,
    unit: r.unit,
    amount: String(r.amount),
  }));
}

export async function updatePricingAmount(
  db: Db,
  admin: AdminSession,
  id: string,
  amount: string,
): Promise<PricingRuleRow> {
  const { data: existing, error: fetchError } = await db
    .from("pricing_rules")
    .select("id,court_id,day_type,time_band,item_type,unit,amount")
    .eq("id", id)
    .single();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Pricing rule not found.", 404);

  const rule = existing as { id: string; court_id: string | null; day_type: string; time_band: string; item_type: string; unit: string; amount: string };

  if (rule.amount === amount) {
    const rows = await listPricingRules(db);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new LaneError("INTERNAL", "Pricing rule unreadable.", 500);
    return row;
  }

  const { error: updateError } = await db
    .from("pricing_rules")
    .update({ amount })
    .eq("id", id);
  if (updateError) throw new LaneError("DB_ERROR", updateError.message, 500);

  await db.from("audit_log").insert([
    audit(admin, "pricing.update", "pricing_rule", id, { amount: rule.amount }, { amount }),
  ]);

  const rows = await listPricingRules(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Pricing rule unreadable.", 500);
  return row;
}

// Paddle/ball rates: flat band rows. Court rates live on operating_hours.amount
// (ADR-13); a band row can no longer price a court slot. Court-scoped
// paddle/ball rows override the global default for that court via pickRule.
const pricingBandSchema = z.object({
  courtId: z.string().uuid("Invalid court."),
  dayType: z.enum(PRICING_DAY_TYPES),
  timeBand: z.enum(PRICING_TIME_BANDS),
  itemType: z.enum(["paddle", "ball"]),
  unit: z.enum(PRICING_UNITS),
  amount: pricingAmountSchema.shape.amount,
});

export const pricingRuleSetSchema = pricingBandSchema;

/**
 * Sets the rate for one (court, dayType, timeBand, itemType) paddle/ball key:
 * updates the court's own row when it has one, inserts the override when it
 * does not. Keyed so a repeated save can never create two rows for the same
 * key. Overrides are removed with deletePricingRule, which returns the court to
 * the global default. Court rates live on the operating_hours row.
 */
export async function setPricingRule(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof pricingRuleSetSchema>,
): Promise<PricingRuleRow> {
  let keyQuery = db
    .from("pricing_rules")
    .select("id")
    .eq("day_type", input.dayType)
    .eq("time_band", input.timeBand)
    .eq("item_type", input.itemType);
  keyQuery =
    input.courtId === null ? keyQuery.is("court_id", null) : keyQuery.eq("court_id", input.courtId);
  const { data: existing, error: fetchError } = await keyQuery.maybeSingle();
  if (fetchError) throw new LaneError("DB_ERROR", fetchError.message, 500);
  if (existing) {
    return updatePricingAmount(db, admin, (existing as { id: string }).id, input.amount);
  }

  const { data, error } = await db
    .from("pricing_rules")
    .insert({
      court_id: input.courtId,
      day_type: input.dayType,
      time_band: input.timeBand,
      item_type: input.itemType,
      unit: input.unit,
      amount: input.amount,
    })
    .select("id")
    .single();
  if (error || !data) throw new LaneError("DB_ERROR", error?.message ?? "Insert failed.", 500);
  const id = (data as { id: string }).id;

  await db.from("audit_log").insert([
    audit(admin, "pricing.create", "pricing_rule", id, null, {
      court_id: input.courtId,
      day_type: input.dayType,
      time_band: input.timeBand,
      item_type: input.itemType,
      unit: input.unit,
      amount: input.amount,
    }),
  ]);

  const rows = await listPricingRules(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Pricing rule unreadable.", 500);
  return row;
}

/**
 * Drops a court's rate override so the court follows the global default again.
 * Global rows have nothing to fall back to, so removing one is refused.
 */
export async function deletePricingRule(
  db: Db,
  admin: AdminSession,
  id: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from("pricing_rules")
    .select("id,court_id,day_type,time_band,item_type,unit,amount")
    .eq("id", id)
    .single();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Pricing rule not found.", 404);

  const rule = existing as {
    id: string; court_id: string | null; day_type: string; time_band: string;
    item_type: string; unit: string; amount: string;
  };
  if (
    rule.court_id === null &&
    (PRICING_TIME_BANDS as readonly string[]).includes(rule.time_band)
  ) {
    throw new LaneError("GLOBAL_RULE", "The global default rate cannot be removed.", 409);
  }

  const { error: deleteError } = await db.from("pricing_rules").delete().eq("id", id);
  if (deleteError) throw new LaneError("DB_ERROR", deleteError.message, 500);

  await db.from("audit_log").insert([
    audit(admin, "pricing.delete", "pricing_rule", id, rule, null),
  ]);
}

// --- Operating hours (ADR-13) --------------------------------------------------
// One row per court per weekday and the row owns the hourly rate. No global
// scope: no rows for a court on a day means CLOSED. Overlap is judged by the
// operating_hours_no_overlap exclusion constraint; the check here only produces
// a friendlier 409.

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
    courtId: z.string().uuid("Invalid court."),
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: hhmm,
    closeTime: hhmm,
    amount: pricingAmountSchema.shape.amount,
  });

export const quickHoursSetupSchema = z
  .object({
    courtId: z.string().uuid("Invalid court."),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    openTime: hhmm,
    closeTime: hhmm,
    amount: pricingAmountSchema.shape.amount,
    confirmOverwrite: z.boolean().optional().default(false),
  })
  .refine((d) => new Set(d.days).size === d.days.length, {
    message: "Days must not be repeated.",
  });

export async function replaceCourtHours(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof quickHoursSetupSchema>,
): Promise<number> {
  const { data, error } = await db.rpc("rpc_add_court_hours", {
    p_court_id: input.courtId,
    p_days: input.days,
    p_open_time: `${input.openTime}:00`,
    p_close_time: `${input.closeTime}:00`,
    p_amount: input.amount,
    p_confirm_overwrite: input.confirmOverwrite,
    p_actor_email: admin.email,
  });
  if (error) {
    if (error.code === "P0002") throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
    if (error.code === "P0001" && error.message.startsWith("HOURS_OVERLAP:")) {
      const conflicts = JSON.parse(error.message.slice("HOURS_OVERLAP:".length)) as string[];
      throw new LaneError("HOURS_OVERLAP", JSON.stringify(conflicts), 409);
    }
    throw new LaneError("DB_ERROR", error.message, 500);
  }
  return Number(data ?? 0);
}

export const hoursAmountSchema = z.object({
  amount: pricingAmountSchema.shape.amount,
});

export const hoursUpdateSchema = z.object({
  openTime: hhmm,
  closeTime: hhmm,
  amount: pricingAmountSchema.shape.amount,
});

export interface HoursRow {
  id: string;
  courtId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  amount: string | null;
}

interface HoursRowRaw {
  id: string;
  court_id: string | null;
  day_of_week: number;
  open_time: string;
  close_time: string;
  amount: string | number | null;
}

function toHoursRow(r: HoursRowRaw): HoursRow {
  return {
    id: r.id,
    courtId: r.court_id as string,
    dayOfWeek: r.day_of_week,
    openTime: shortTime(r.open_time),
    closeTime: shortTime(r.close_time),
    amount: r.amount === null ? null : String(r.amount),
  };
}

export function toDbTime(hhmmValue: string): string {
  return `${hhmmValue}:00`;
}

export function shortTime(dbTime: string): string {
  return dbTime.slice(0, 5);
}

export async function listHours(db: Db): Promise<HoursRow[]> {
  const { data, error } = await db
    .from("operating_hours")
    .select("id,court_id,day_of_week,open_time,close_time,amount")
    .order("day_of_week", { ascending: true });
  if (error) throw new LaneError("DB_ERROR", error.message, 500);

  return ((data ?? []) as HoursRowRaw[])
    .filter((r) => r.court_id !== null)
    .map(toHoursRow);
}

function minutesOfWall(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h as number) * 60 + (m as number);
}

/** Wrap-aware minute span: close <= open spills past midnight (+1440). */
function minuteSpan(open: string, close: string): [number, number] {
  const start = minutesOfWall(open);
  const end = minutesOfWall(close);
  return [start, end <= start ? end + 1440 : end];
}

function spansOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function overlapMessage(row: {
  day_of_week: number;
  open_time: string;
  close_time: string;
}): string {
  const start = minutesOfWall(row.open_time) / 60;
  const end = minutesOfWall(row.close_time) / 60;
  return `This overlaps ${dayName(row.day_of_week)} ${windowLabel({ start, end })} — pick a different time.`;
}

async function findHoursConflict(
  db: Db,
  courtId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  excludeId?: string,
): Promise<{ day_of_week: number; open_time: string; close_time: string } | undefined> {
  const { data } = await db
    .from("operating_hours")
    .select("id,day_of_week,open_time,close_time")
    .eq("court_id", courtId)
    .eq("day_of_week", dayOfWeek);
  const wanted = minuteSpan(openTime, closeTime);
  return (data ?? []).find((r: { id?: string; open_time: string; close_time: string }) =>
    (!excludeId || r.id !== excludeId) && spansOverlap(wanted, minuteSpan(r.open_time, r.close_time)),
  );
}

export async function createHours(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof hoursCreateSchema>,
): Promise<HoursRow> {
  const { data: c } = await db.from("courts").select("id").eq("id", input.courtId).maybeSingle();
  if (!c) throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);

  const conflict = await findHoursConflict(
    db,
    input.courtId,
    input.dayOfWeek,
    input.openTime,
    input.closeTime,
  );
  if (conflict) throw new LaneError("HOURS_OVERLAP", overlapMessage(conflict), 409);

  const { data: inserted, error: insertError } = await db
    .from("operating_hours")
    .insert({
      court_id: input.courtId,
      day_of_week: input.dayOfWeek,
      open_time: toDbTime(input.openTime),
      close_time: toDbTime(input.closeTime),
      amount: input.amount,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    // 23P01 = exclusion_violation (operating_hours_no_overlap). Re-read the
    // scope so the 409 can still name the conflicting row.
    if (insertError?.code === "23P01") {
      const dbConflict = await findHoursConflict(
        db,
        input.courtId,
        input.dayOfWeek,
        input.openTime,
        input.closeTime,
      );
      throw new LaneError(
        "HOURS_OVERLAP",
        dbConflict
          ? overlapMessage(dbConflict)
          : "This overlaps an existing hours row — pick a different time.",
        409,
      );
    }
    if (insertError?.code === "23503") {
      throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
    }
    throw new LaneError("INTERNAL", "Hours creation failed.", 500);
  }

  const id = (inserted as { id: string }).id;
  await db.from("audit_log").insert([
    audit(admin, "hours.create", "operating_hours", id, null, input),
  ]);

  const rows = await listHours(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Hours row unreadable.", 500);
  return row;
}

/** Amount-only edit for one hours row (inline rate edit in the admin grid). */
export async function updateHoursAmount(
  db: Db,
  admin: AdminSession,
  id: string,
  amount: string,
): Promise<HoursRow> {
  const { data: existing, error: fetchError } = await db
    .from("operating_hours")
    .select("id,amount")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Hours row not found.", 404);

  const before = existing as { amount: string | number | null };
  if (String(before.amount) !== amount) {
    const { error: updateError } = await db
      .from("operating_hours")
      .update({ amount })
      .eq("id", id);
    if (updateError) throw new LaneError("DB_ERROR", updateError.message, 500);
    await db.from("audit_log").insert([
      audit(admin, "hours.amount", "operating_hours", id, { amount: before.amount }, { amount }),
    ]);
  }

  const rows = await listHours(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Hours row unreadable.", 500);
  return row;
}

/** Updates a row's time range and rate without allowing overlap on its day. */
export async function updateHours(
  db: Db,
  admin: AdminSession,
  id: string,
  input: z.infer<typeof hoursUpdateSchema>,
): Promise<HoursRow> {
  const { data: existing, error: fetchError } = await db
    .from("operating_hours")
    .select("id,court_id,day_of_week,open_time,close_time,amount")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Hours row not found.", 404);

  const before = existing as HoursRowRaw;
  const conflict = await findHoursConflict(
    db,
    before.court_id as string,
    before.day_of_week,
    input.openTime,
    input.closeTime,
    id,
  );
  if (conflict) throw new LaneError("HOURS_OVERLAP", overlapMessage(conflict), 409);

  const { error: updateError } = await db
    .from("operating_hours")
    .update({ open_time: toDbTime(input.openTime), close_time: toDbTime(input.closeTime), amount: input.amount })
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23P01") {
      throw new LaneError("HOURS_OVERLAP", "This overlaps an existing hours row — pick a different time.", 409);
    }
    throw new LaneError("DB_ERROR", updateError.message, 500);
  }

  await db.from("audit_log").insert([
    audit(admin, "hours.update", "operating_hours", id, toHoursRow(before), input),
  ]);

  const rows = await listHours(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Hours row unreadable.", 500);
  return row;
}

export async function deleteHours(db: Db, admin: AdminSession, id: string): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from("operating_hours")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Hours row not found.", 404);

  const { error: deleteError } = await db.from("operating_hours").delete().eq("id", id);
  if (deleteError) throw new LaneError("DB_ERROR", deleteError.message, 500);

  await db.from("audit_log").insert([
    audit(admin, "hours.delete", "operating_hours", id, existing, null),
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
  // Closures self-clear once passed: purge rows whose end_at is behind us.
  // Best effort — a failed purge only leaves stale rows for next time.
  await db.from("closures").delete().lt("end_at", new Date().toISOString());

  const { data: rows, error: rowsError } = await db
    .from("closures")
    .select("id,scope,court_id,start_at,end_at,reason,by")
    .order("start_at", { ascending: true });
  if (rowsError) throw new LaneError("DB_ERROR", rowsError.message, 500);

  const { data: courtRows, error: courtError } = await db
    .from("courts")
    .select("id,name");
  if (courtError) throw new LaneError("DB_ERROR", courtError.message, 500);

  const names = new Map((courtRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  return (rows ?? []).map((r: {
    id: string; scope: string; court_id: string | null;
    start_at: string; end_at: string; reason: string | null; by: string | null;
  }) => ({
    id: r.id,
    scope: r.scope,
    courtId: r.court_id,
    courtName:
      r.scope === "global"
        ? "All courts"
        : (r.court_id ? names.get(r.court_id) : null) ?? "(deleted court)",
    startAt: r.start_at,
    endAt: r.end_at,
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
    const { data: c } = await db.from("courts").select("id").eq("id", courtId).single();
    if (!c) throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
  }

  const { data: inserted, error: insertError } = await db
    .from("closures")
    .insert({
      scope: input.scope,
      court_id: courtId,
      start_at: new Date(input.startAt).toISOString(),
      end_at: new Date(input.endAt).toISOString(),
      reason: input.reason ?? null,
      by: admin.email,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new LaneError("INTERNAL", "Closure creation failed.", 500);

  const id = (inserted as { id: string }).id;
  await db.from("audit_log").insert([
    audit(admin, "closure.create", "closure", id, null, { ...input, by: admin.email }),
  ]);

  const rows = await listClosures(db);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new LaneError("INTERNAL", "Closure unreadable.", 500);
  return row;
}

export async function deleteClosure(db: Db, admin: AdminSession, id: string): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from("closures")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) throw new LaneError("NOT_FOUND", "Closure not found.", 404);

  const { error: deleteError } = await db.from("closures").delete().eq("id", id);
  if (deleteError) throw new LaneError("DB_ERROR", deleteError.message, 500);

  await db.from("audit_log").insert([
    audit(admin, "closure.delete", "closure", id, existing, null),
  ]);
}
