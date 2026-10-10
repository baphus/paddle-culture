import { TZDate } from "@date-fns/tz";
import type { Db } from "@/db/client";
import { MANILA_TZ } from "./constants";
import { LaneError } from "./errors";

// Operating-hours + closures enforcement.
// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

interface HoursRow {
  courtId: string | null;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

interface ClosureRow {
  scope: string;
  courtId: string | null;
  startAt: Date;
  endAt: Date;
}

export interface OpenRules {
  hours: HoursRow[];
  closures: ClosureRow[];
}

/** Load rules covering [from, to) for the given courts (read-only). */
export async function loadOpenRules(
  db: Db,
  args: { courtIds: string[]; from: Date; to: Date },
): Promise<OpenRules> {
  // operating_hours: rows for any of the specified courts OR global (court_id IS NULL)
  const { data: hoursData, error: hoursError } = await db
    .from("operating_hours")
    .select("court_id,day_of_week,open_time,close_time")
    .or(`court_id.in.(${args.courtIds.join(",")}),court_id.is.null`);

  if (hoursError) throw new LaneError("DB_ERROR", hoursError.message, 500);

  // closures: overlapping the [from, to) range, global or for these courts
  const courtFilter = args.courtIds.map((id) => `court_id.eq.${id}`).join(",");
  const scopeFilter = courtFilter
    ? `scope.eq.global,and(scope.eq.court,or(${courtFilter}))`
    : "scope.eq.global";

  const { data: closureData, error: closureError } = await db
    .from("closures")
    .select("scope,court_id,start_at,end_at")
    .gt("end_at", args.from.toISOString())
    .lt("start_at", args.to.toISOString())
    .or(scopeFilter);

  if (closureError) throw new LaneError("DB_ERROR", closureError.message, 500);

  const hours: HoursRow[] = (hoursData ?? []).map((r) => ({
    courtId: r.court_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
  }));

  const closures: ClosureRow[] = (closureData ?? []).map((r) => ({
    scope: r.scope,
    courtId: r.court_id,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
  }));

  return { hours, closures };
}

function minutesOfWall(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h as number) * 60 + (m as number);
}

/**
 * True when a slot start is inside operating hours and not closed.
 */
export function isSlotOpen(
  rules: OpenRules,
  courtId: string,
  start: Date,
): boolean {
  const end = new Date(start.getTime() + 3_600_000);
  for (const c of rules.closures) {
    if (c.scope !== "global" && c.courtId !== courtId) continue;
    if (start < c.endAt && c.startAt < end) return false;
  }

  const z = new TZDate(start, MANILA_TZ);
  const day = z.getDay();
  const mins = z.getHours() * 60 + z.getMinutes();
  const prevDay = (day + 6) % 7;
  const scoped = rules.hours.filter((h) => h.courtId === courtId);
  const forDay = (d: number): HoursRow[] => {
    const s = scoped.filter((h) => h.dayOfWeek === d);
    if (s.length > 0) return s;
    return rules.hours.filter(
      (h) => h.courtId === null && h.dayOfWeek === d,
    );
  };
  const todayRows = forDay(day);
  const prevRows = forDay(prevDay);
  // Fail closed: no hours row for this court (scoped or global) on this day or
  // the previous one means "not configured", which is NOT the same as open.
  // A mis-seeded hours table used to make every slot bookable.
  if (todayRows.length === 0 && prevRows.length === 0) return false;
  for (const r of todayRows) {
    const o = minutesOfWall(r.openTime);
    let c = minutesOfWall(r.closeTime);
    if (c <= o) c += 1440; // overnight
    if (mins >= o && mins < c) return true;
  }
  for (const r of prevRows) {
    const o = minutesOfWall(r.openTime);
    const c = minutesOfWall(r.closeTime);
    if (c <= o && mins < c) return true; // overnight spill into today
  }
  return false;
}

/** Throw SLOT_CLOSED (409) naming the first closed slot. Read-only. */
export async function assertSlotsOpen(
  db: Db,
  slots: Array<{ courtId: string; start: Date }>,
): Promise<void> {
  if (slots.length === 0) return;
  const courtIds = [...new Set(slots.map((s) => s.courtId))];
  const times = slots.map((s) => s.start.getTime());
  const rules = await loadOpenRules(db, {
    courtIds,
    from: new Date(Math.min(...times) - 3_600_000),
    to: new Date(Math.max(...times) + 2 * 3_600_000),
  });
  for (const s of slots) {
    if (!isSlotOpen(rules, s.courtId, s.start)) {
      throw new LaneError(
        "SLOT_CLOSED",
        `Slot ${s.start.toISOString()} is outside operating hours or closed.`,
        409,
      );
    }
  }
}
