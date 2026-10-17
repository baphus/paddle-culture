import { TZDate } from "@date-fns/tz";

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  at: string;
};

/** Manila wall-clock parts of an instant. */
function manila(dateStr: string) {
  return new TZDate(dateStr, "Asia/Manila");
}

/** "Oct 25, 2026, 10:30 AM" — full tooltip timestamp. */
export function formatAt(dateStr: string): string {
  return manila(dateStr).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "06:20 PM" — the compact per-row time. */
export function formatClock(dateStr: string): string {
  return manila(dateStr).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "SUNDAY, 06 MARCH" — uppercase day heading, grouped like the feed example. */
export function formatDayHeader(dateStr: string): string {
  const z = manila(dateStr);
  const weekday = z
    .toLocaleDateString("en-PH", { weekday: "long" })
    .toUpperCase();
  const day = String(z.getDate()).padStart(2, "0");
  const month = z.toLocaleDateString("en-PH", { month: "long" }).toUpperCase();
  return `${weekday}, ${day} ${month}`;
}

/**
 * First letter of the person behind an `actor` value.
 * `actor` holds an email (`sarah.jones@ckgrounds.ph`), so drop the domain before
 * taking the initial — otherwise the last segment resolves to the domain ("SP"
 * for ckgrounds.ph). Handles "Sarah Jones", "sarah.jones", "sarah_jones", and
 * "system".
 */
export function initialsOf(actor: string): string {
  const localPart = actor.split("@")[0] ?? "";
  const parts = localPart
    .split(/[.\s_-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Skip punctuation so a stray "@" or "." never renders as the avatar glyph.
  const letter = (parts[0] ?? actor.trim()).match(/[a-z0-9]/i)?.[0];
  return (letter ?? "?").toUpperCase();
}
