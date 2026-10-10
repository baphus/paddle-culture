import { z } from "zod";
import type { Db } from "@/db/client";
import { LaneError } from "@/lib/booking/errors";
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
    time_band: string; item_type: string; unit: string; amount: string;
  }) => ({
    id: r.id,
    courtId: r.court_id,
    courtName: r.court_id ? (names.get(r.court_id) ?? "(deleted court)") : "All courts (global)",
    dayType: r.day_type,
    timeBand: r.time_band,
    itemType: r.item_type,
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

// --- Operating hours -----------------------------------------------------------

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
  const { data: rows, error: rowsError } = await db
    .from("operating_hours")
    .select("id,court_id,day_of_week,open_time,close_time")
    .order("day_of_week", { ascending: true });
  if (rowsError) throw new LaneError("DB_ERROR", rowsError.message, 500);

  const { data: courtRows, error: courtError } = await db
    .from("courts")
    .select("id,name");
  if (courtError) throw new LaneError("DB_ERROR", courtError.message, 500);

  const names = new Map((courtRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  return (rows ?? []).map((r: { id: string; court_id: string | null; day_of_week: number; open_time: string; close_time: string }) => ({
    id: r.id,
    courtId: r.court_id,
    courtName: r.court_id ? (names.get(r.court_id) ?? "(deleted court)") : "All courts (global)",
    dayOfWeek: r.day_of_week,
    openTime: shortTime(r.open_time),
    closeTime: shortTime(r.close_time),
  }));
}

export async function createHours(
  db: Db,
  admin: AdminSession,
  input: z.infer<typeof hoursCreateSchema>,
): Promise<HoursRow> {
  if (input.courtId) {
    const { data: c } = await db.from("courts").select("id").eq("id", input.courtId).single();
    if (!c) throw new LaneError("UNKNOWN_COURT", "Court does not exist.", 404);
  }

  const { data: inserted, error: insertError } = await db
    .from("operating_hours")
    .insert({
      court_id: input.courtId,
      day_of_week: input.dayOfWeek,
      open_time: toDbTime(input.openTime),
      close_time: toDbTime(input.closeTime),
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new LaneError("INTERNAL", "Hours creation failed.", 500);

  const id = (inserted as { id: string }).id;
  await db.from("audit_log").insert([
    audit(admin, "hours.create", "operating_hours", id, null, input),
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
