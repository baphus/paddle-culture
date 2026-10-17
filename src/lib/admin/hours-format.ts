// Manila date helpers for the admin Hours & Closures page.
// Manila is a fixed UTC+8 offset (no DST), so wall-clock math needs no Intl.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila calendar date "YYYY-MM-DD" for an instant. */
export function manilaDay(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function manilaToday(): string {
  return manilaDay(new Date().toISOString());
}

/** Whole days from b to a (UTC-based, timezone-safe). */
export function dayDiff(a: string, b: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  };
  return Math.round((ms(a) - ms(b)) / 86_400_000);
}

/** "Fri, Oct 24" from a Manila "YYYY-MM-DD" date string. */
export function fmtDay(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** Relative label for a Manila date: Today / Tomorrow / in 3 days / 2 days ago. */
export function relativeDay(date: string, today: string = manilaToday()): string {
  const diff = dayDiff(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 1 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Whole-day closure window: Manila midnight → midnight after the last day. */
export function wholeDayRange(from: string, to: string): { startAt: string; endAt: string } {
  const end = new Date(`${to}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startAt: new Date(`${from}T00:00:00+08:00`).toISOString(),
    endAt: end.toISOString(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "YYYY-MM-DD" for a calendar day picked in a date picker.
 * Local getters are correct here: the picker hands back the day the admin
 * clicked, not an instant to be converted.
 */
export function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Collapse picked dates into runs of consecutive days (one closure each). */
export function groupRuns(dates: string[]): { from: string; to: string }[] {
  const runs: { from: string; to: string }[] = [];
  for (const day of [...new Set(dates)].sort()) {
    const last = runs[runs.length - 1];
    if (last && dayDiff(day, last.to) === 1) last.to = day;
    else runs.push({ from: day, to: day });
  }
  return runs;
}
