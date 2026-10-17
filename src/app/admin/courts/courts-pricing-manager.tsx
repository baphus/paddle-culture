"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, RotateCcw, Save } from "lucide-react";
import { CourtStatusBadge } from "@/components/admin/status-badge";
import LandingImage from "@/components/landing/landing-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CourtRow, PricingRuleRow } from "@/lib/admin/config";

// ── vocabulary / ordering ─────────────────────────────────────────────────

function labelFor(field: string) {
  const map: Record<string, string> = {
    weekday: "Weekday",
    weekend: "Weekend",
    holiday: "Holiday",
    all: "All days",
    morning: "Morning",
    evening: "Evening",
    court: "Court",
    paddle: "Paddle",
    ball: "Ball",
    slot: "per hour",
    hour: "per hour",
    flat: "one-time",
  };
  return map[field] ?? field.replace(/_/g, " ");
}

const DAY_TYPE_ORDER = ["weekday", "weekend", "holiday", "all"];
const TIME_BAND_ORDER = ["morning", "evening", "all"];

/** One editable rate = one (itemType, dayType, timeBand) key. */
interface Cell {
  key: string;
  courtId: string | null;
  dayType: string;
  timeBand: string;
  itemType: string;
  /** The row whose amount is shown — the override when there is one. */
  rule: PricingRuleRow;
  /** The court's own override row, when it has one. */
  own: PricingRuleRow | null;
}

const keyOf = (r: { itemType: string; dayType: string; timeBand: string }) =>
  `${r.itemType}|${r.dayType}|${r.timeBand}`;

const orderIndex = (list: string[], v: string) => {
  const i = list.indexOf(v);
  return i < 0 ? 99 : i;
};

// ── fields ────────────────────────────────────────────────────────────────

function AmountField({
  label,
  amount,
  draft,
  busy,
  overridden,
  onChange,
  onSave,
  onReset,
}: {
  label: string;
  amount: string;
  draft: string | undefined;
  busy: boolean;
  overridden?: boolean;
  onChange: (val: string) => void;
  onSave: () => void;
  /** Present only for a court's own rate — drops it back to the global default. */
  onReset?: () => void;
}) {
  const current = draft ?? amount;
  const isDirty = current.trim() !== amount;

  return (
    <div className="flex items-center gap-1.5">
      {overridden !== undefined ? (
        <span
          title={overridden ? "Set for this court" : "Follows the global default"}
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            overridden ? "bg-primary" : "bg-muted-foreground/30",
          )}
        />
      ) : null}
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-muted-foreground">₱</span>
      <Input
        aria-label={`${label} rate`}
        value={current}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 w-20 text-right font-semibold tabular-nums",
          isDirty && "border-ring ring-1 ring-ring/30",
        )}
      />
      {onReset ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={busy}
          onClick={onReset}
          title="Reset to the global default"
          aria-label="Reset to the global default"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      ) : null}
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-7", !isDirty && "invisible")}
        disabled={busy}
        onClick={onSave}
        aria-label="Save rate"
      >
        {busy ? "…" : <Save className="size-3.5" />}
      </Button>
    </div>
  );
}

// ── one rate = one key ────────────────────────────────────────────────────

function CellField({
  cell,
  scope,
  amounts,
  busy,
  onChange,
  onSave,
  onReset,
}: {
  cell: Cell;
  /** Unique per card so drafts of two courts never collide. */
  scope: string;
  amounts: Record<string, string>;
  busy: string | null;
  onChange: (draftKey: string, val: string) => void;
  onSave: (cell: Cell, draftKey: string) => void;
  onReset: (cell: Cell, draftKey: string) => void;
}) {
  const rule = cell.rule;
  const draftKey = `${scope}|${cell.key}`;
  return (
    <AmountField
      label={labelFor(cell.timeBand)}
      amount={rule.amount}
      draft={amounts[draftKey]}
      busy={busy === draftKey}
      overridden={cell.courtId !== null ? cell.own !== null : undefined}
      onChange={(val) => onChange(draftKey, val)}
      onSave={() => onSave(cell, draftKey)}
      // Only a court's own row can be dropped; global rows have no fallback.
      onReset={
        cell.courtId !== null && cell.own ? () => onReset(cell, draftKey) : undefined
      }
    />
  );
}

// ── card chrome ───────────────────────────────────────────────────────────

function RateCard({
  title,
  image,
  headerExtra,
  summary,
  footer,
  children,
}: {
  title: string;
  image?: { src: string; alt: string };
  headerExtra?: ReactNode;
  summary: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground">
      {image ? (
        <LandingImage src={image.src} alt={image.alt} className="h-32 w-full shrink-0" />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        {headerExtra}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center justify-between border-t px-5 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
        {summary}
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open ? children : null}
      {open && footer ? (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">{footer}</p>
      ) : null}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export default function CourtsPricingManager({
  courts,
  rules,
}: {
  courts: CourtRow[];
  rules: PricingRuleRow[];
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const globalByKey = useMemo(() => {
    const m = new Map<string, PricingRuleRow>();
    for (const r of rules) if (r.courtId === null) m.set(keyOf(r), r);
    return m;
  }, [rules]);

  const byCourt = useMemo(() => {
    const m = new Map<string, PricingRuleRow[]>();
    for (const r of rules) {
      if (!r.courtId) continue;
      const list = m.get(r.courtId);
      if (list) list.push(r);
      else m.set(r.courtId, [r]);
    }
    return m;
  }, [rules]);

  /**
   * A court's editable rates: the global rate card as the template, plus any
   * row the court has of its own (which wins over the global row of that key).
   */
  function cellsFor(courtId: string): Cell[] {
    const cells = new Map<string, Cell>();
    for (const [key, r] of globalByKey) {
      if (r.itemType !== "court") continue;
      cells.set(key, {
        key,
        courtId,
        dayType: r.dayType,
        timeBand: r.timeBand,
        itemType: r.itemType,
        rule: r,
        own: null,
      });
    }
    for (const r of byCourt.get(courtId) ?? []) {
      const key = keyOf(r);
      cells.set(key, {
        key,
        courtId,
        dayType: r.dayType,
        timeBand: r.timeBand,
        itemType: r.itemType,
        rule: r,
        own: r,
      });
    }
    return [...cells.values()].sort(
      (a, b) =>
        orderIndex(DAY_TYPE_ORDER, a.dayType) - orderIndex(DAY_TYPE_ORDER, b.dayType) ||
        orderIndex(TIME_BAND_ORDER, a.timeBand) - orderIndex(TIME_BAND_ORDER, b.timeBand) ||
        a.itemType.localeCompare(b.itemType),
    );
  }

  const rentalCells = useMemo<Cell[]>(
    () =>
      rules
        .filter((r) => r.courtId === null && r.itemType !== "court")
        .map((r) => ({
          key: keyOf(r),
          courtId: null,
          dayType: r.dayType,
          timeBand: r.timeBand,
          itemType: r.itemType,
          rule: r,
          own: r,
        }))
        .sort((a, b) => a.itemType.localeCompare(b.itemType)),
    [rules],
  );

  const changeAmount = (draftKey: string, val: string) =>
    setAmounts((m) => ({ ...m, [draftKey]: val }));

  const dirtyCount = (cells: Cell[], scope: string) =>
    cells.filter((c) => {
      const draft = amounts[`${scope}|${c.key}`];
      return draft !== undefined && draft.trim() !== c.rule.amount;
    }).length;

  async function save(cell: Cell, draftKey: string) {
    const rule = cell.rule;
    const amount = (amounts[draftKey] ?? rule.amount).trim();
    if (amount === rule.amount) {
      toast.info("No change to save.");
      return;
    }
    setBusy(draftKey);
    try {
      // Own row → edit it. Inherited only → create this court's override (POST
      // is keyed, so it updates instead of duplicating if the row appeared).
      const res = cell.own
        ? await fetch(`/api/admin/pricing/${cell.own.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ amount }),
          })
        : await fetch("/api/admin/pricing", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              courtId: cell.courtId,
              dayType: cell.dayType,
              timeBand: cell.timeBand,
              itemType: cell.itemType,
              unit: rule.unit,
              amount,
            }),
          });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Pricing update failed.");
        return;
      }
      // Clear the draft so it no longer shows as dirty
      setAmounts((m) => {
        const next = { ...m };
        delete next[draftKey];
        return next;
      });
      toast.success(`Rate updated to ₱${parseFloat(amount).toFixed(2)}.`);
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function reset(cell: Cell, draftKey: string) {
    if (!cell.own) return;
    setBusy(draftKey);
    try {
      const res = await fetch(`/api/admin/pricing/${cell.own.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Reset failed.");
        return;
      }
      setAmounts((m) => {
        const next = { ...m };
        delete next[draftKey];
        return next;
      });
      toast.success("Reset to the global default.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function flip(court: CourtRow) {
    const next = court.status === "active" ? "inactive" : "active";
    setBusy(court.id);
    try {
      const res = await fetch(`/api/admin/courts/${court.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Court update failed.");
        return;
      }
      toast.success(next === "active" ? "Court activated." : "Court deactivated.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Courts</h2>
          <p className="text-xs text-muted-foreground">
            Each field shows what this court charges. Editing one sets a rate for
            this court only — the others keep following the global default.
            Inactive courts are hidden from booking but retain all history.
          </p>
        </div>

        {courts.length > 0 ? (
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {courts.map((court, i) => {
              const cells = cellsFor(court.id);
              const scope = `court:${court.id}`;
              const dirty = dirtyCount(cells, scope);
              const days = [...new Set(cells.map((c) => c.dayType))].sort(
                (a, b) => orderIndex(DAY_TYPE_ORDER, a) - orderIndex(DAY_TYPE_ORDER, b),
              );

              return (
                <RateCard
                  key={court.id}
                  title={court.name}
                  image={{
                    src: `/images/court-${(i % 2) + 1}.jpg`,
                    alt: `${court.name} photo`,
                  }}
                  headerExtra={
                    <>
                      <CourtStatusBadge status={court.status} />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => flip(court)}
                      >
                        {busy === court.id
                          ? "Saving…"
                          : court.status === "active"
                            ? "Deactivate"
                            : "Activate"}
                      </Button>
                    </>
                  }
                  summary={
                    <span>
                      Rates
                      {dirty > 0 ? (
                        <span className="ml-2 font-medium text-foreground">{dirty} unsaved</span>
                      ) : null}
                    </span>
                  }
                  footer="A dot means the rate is set for this court; no dot means it follows the global default. The reset arrow drops the court's rate back to that default."
                >
                  {cells.length > 0 ? (
                    <div className="space-y-3 px-5 pb-5">
                      {days.map((day) => (
                        <div key={day} className="space-y-2">
                          <p className="text-xs font-medium">{labelFor(day)}</p>
                          <div className="space-y-1.5 pl-1">
                            {cells
                              .filter((c) => c.dayType === day)
                              .map((cell) => (
                                <CellField
                                  key={cell.key}
                                  cell={cell}
                                  scope={scope}
                                  amounts={amounts}
                                  busy={busy}
                                  onChange={changeAmount}
                                  onSave={save}
                                  onReset={reset}
                                />
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-5 pb-5 text-xs text-muted-foreground">
                      No rates configured for this court.
                    </p>
                  )}
                </RateCard>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No courts found.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Rentals</h2>
          <p className="text-xs text-muted-foreground">
            Gear rates — they apply to every court and every day.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RateCard
            title="Paddles & balls"
            image={{ src: "/images/paddle.jpg", alt: "Paddles and balls on court" }}
            summary={
              <span>
                {rentalCells.length} rate{rentalCells.length !== 1 ? "s" : ""}
                {dirtyCount(rentalCells, "global") > 0 ? (
                  <span className="ml-2 font-medium text-foreground">
                    {dirtyCount(rentalCells, "global")} unsaved
                  </span>
                ) : null}
              </span>
            }
          >
            {rentalCells.length > 0 ? (
              <div className="space-y-2 px-5 pb-5">
                {rentalCells.map((cell) => {
                  const rule = cell.rule;
                  const scoped = cell.dayType !== "all" || cell.timeBand !== "all";
                  return (
                    <div
                      key={cell.key}
                      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{labelFor(cell.itemType)}</p>
                        <p className="text-xs text-muted-foreground">
                          {labelFor(rule.unit)}
                          {scoped
                            ? ` · ${labelFor(cell.dayType)} ${labelFor(cell.timeBand)}`
                            : ""}
                        </p>
                      </div>
                      <CellField
                        cell={cell}
                        scope="global"
                        amounts={amounts}
                        busy={busy}
                        onChange={changeAmount}
                        onSave={save}
                        onReset={reset}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 pb-5 text-xs text-muted-foreground">
                No rental rates found.
              </p>
            )}
          </RateCard>
        </div>
      </section>
    </div>
  );
}
