import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import type { Db } from "@/db/client";
import { closures, operatingHours } from "@/db/schema";
import { MANILA_TZ } from "./constants";
import { LaneError } from "./errors";

// Operating-hours + closures enforcement (deferred follow-up lane).
// Surgical by design: read-only rule loading + a pure per-slot predicate.
// Pricing and holds logic are untouched; availability/holds/submit call in.

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
  const hours = await db
    .select({
      courtId: operatingHours.courtId,
      dayOfWeek: operatingHours.dayOfWeek,
      openTime: operatingHours.openTime,
      closeTime: operatingHours.closeTime,
    })
    .from(operatingHours)
    .where(
      or(
        inArray(operatingHours.courtId, args.courtIds),
        isNull(operatingHours.courtId),
      ),
    );
  const ruleClosures = await db
    .select({
      scope: closures.scope,
      courtId: closures.courtId,
      startAt: closures.startAt,
      endAt: closures.endAt,
    })
    .from(closures)
    .where(
      and(
        gt(closures.endAt, args.from),
        lt(closures.startAt, args.to),
        or(
          eq(closures.scope, "global"),
          and(
            eq(closures.scope, "court"),
            inArray(closures.courtId, args.courtIds),
          ),
        ),
      ),
    );
  return { hours, closures: ruleClosures };
}

function minutesOfWall(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h as number) * 60 + (m as number);
}

/**
 * True when a slot start is inside operating hours and not closed.
 * Precedence: court-specific day rows beat global day rows; overnight
 * close<=open spills into the next Manila day; a day with NO configured
 * rows (court or global, today or spilling from yesterday) defaults to OPEN
 * for the full operating day — preserves booking until hours are configured.
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
  if (todayRows.length === 0 && prevRows.length === 0) return true;
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
