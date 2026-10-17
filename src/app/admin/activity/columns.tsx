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

export function summarize(value: unknown): string {
  if (value == null) return "—";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

export function formatAt(dateStr: string): string {
  return new TZDate(dateStr, "Asia/Manila").toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
