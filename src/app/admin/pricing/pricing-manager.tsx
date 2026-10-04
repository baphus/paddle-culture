"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PricingRuleRow } from "@/lib/admin/config";

// ── helpers ──────────────────────────────────────────────────────────────

function formatPeso(amount: string) {
  const n = parseFloat(amount);
  return isNaN(n) ? amount : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function labelFor(field: string) {
  const map: Record<string, string> = {
    weekday: "Weekday",
    weekend: "Weekend",
    holiday: "Holiday",
    peak: "Peak",
    "off-peak": "Off-peak",
    off_peak: "Off-peak",
    standard: "Standard",
    court: "Court",
    paddle: "Paddle",
    per_hour: "/ hr",
    per_item: "/ item",
    per_session: "/ session",
  };
  return map[field] ?? field.replace(/_/g, " ");
}

const DAY_TYPE_ORDER = ["weekday", "weekend", "holiday"];
const TIME_BAND_ORDER = ["peak", "off-peak", "off_peak", "standard"];

function sortKey(r: PricingRuleRow) {
  const d = DAY_TYPE_ORDER.indexOf(r.dayType);
  const t = TIME_BAND_ORDER.indexOf(r.timeBand);
  return `${d < 0 ? 99 : d}-${t < 0 ? 99 : t}-${r.itemType}`;
}

// ── sub-components ────────────────────────────────────────────────────────

function DayTypePill({ dayType }: { dayType: string }) {
  const styles: Record<string, string> = {
    weekday: "bg-columbia/60 text-pine",
    weekend: "bg-flame-light text-flame",
    holiday: "bg-oat text-cocoa",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        styles[dayType] ?? "bg-oat text-cocoa",
      )}
    >
      {labelFor(dayType)}
    </span>
  );
}

function RuleRow({
  rule,
  draft,
  busy,
  onChange,
  onSave,
}: {
  rule: PricingRuleRow;
  draft: string | undefined;
  busy: boolean;
  onChange: (val: string) => void;
  onSave: () => void;
}) {
  const current = draft ?? rule.amount;
  const isDirty = current.trim() !== rule.amount;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 transition-shadow hover:shadow-sm">
      {/* Labels */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <DayTypePill dayType={rule.dayType} />
          <span className="text-xs text-warm-muted">{labelFor(rule.timeBand)}</span>
          <span className="text-warm-muted/40">·</span>
          <span className="text-xs font-medium text-ink capitalize">{labelFor(rule.itemType)}</span>
          <span className="text-xs text-warm-muted">{labelFor(rule.unit)}</span>
        </div>
      </div>

      {/* Amount input */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium text-warm-muted">₱</span>
        <Input
          aria-label={`Rate for ${rule.courtName} ${rule.dayType} ${rule.timeBand} ${rule.itemType}`}
          value={current}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-8 w-24 rounded-lg border-line text-sm font-semibold text-right tabular-nums transition-colors",
            isDirty && "border-flame/50 bg-flame-light/50 ring-1 ring-flame/20",
          )}
        />
        <Button
          size="sm"
          disabled={!isDirty || busy}
          onClick={onSave}
          className={cn(
            "h-8 rounded-lg px-3 text-xs font-bold transition-all",
            isDirty
              ? "bg-flame text-white hover:bg-flame-hover"
              : "invisible",
          )}
          aria-label="Save rate"
        >
          {busy ? "…" : <Save className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function CourtCard({
  courtName,
  rules,
  amounts,
  busy,
  onChange,
  onSave,
}: {
  courtName: string;
  rules: PricingRuleRow[];
  amounts: Record<string, string>;
  busy: string | null;
  onChange: (id: string, val: string) => void;
  onSave: (rule: PricingRuleRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const isGlobal = rules[0]?.courtId === null;

  // Count unsaved changes in this card
  const dirtyCount = rules.filter((r) => {
    const draft = amounts[r.id];
    return draft !== undefined && draft.trim() !== r.amount;
  }).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-parchment/40 shadow-sm">
      {/* Card header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-oat/30"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          {/* Court icon */}
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
            isGlobal
              ? "bg-pine/10 text-pine"
              : "bg-flame-light text-flame",
          )}>
            {isGlobal ? "🌐" : courtName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-ink">{courtName}</p>
            <p className="text-xs text-warm-muted">
              {rules.length} rate{rules.length !== 1 ? "s" : ""}
              {dirtyCount > 0 && (
                <span className="ml-2 font-semibold text-flame">
                  {dirtyCount} unsaved
                </span>
              )}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-warm-muted" />
        ) : (
          <ChevronDown className="size-4 text-warm-muted" />
        )}
      </button>

      {/* Rule rows */}
      {open && (
        <div className="space-y-2 border-t border-line px-4 pb-4 pt-3">
          {[...rules].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              draft={amounts[rule.id]}
              busy={busy === rule.id}
              onChange={(val) => onChange(rule.id, val)}
              onSave={() => onSave(rule)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export default function PricingManager({
  initial,
}: {
  initial: PricingRuleRow[];
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Group rules by courtName
  const groups = initial.reduce<Record<string, PricingRuleRow[]>>((acc, r) => {
    const key = r.courtName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Global rules first, then court-specific sorted by name
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const aGlobal = groups[a]?.[0]?.courtId === null;
    const bGlobal = groups[b]?.[0]?.courtId === null;
    if (aGlobal && !bGlobal) return -1;
    if (!aGlobal && bGlobal) return 1;
    return a.localeCompare(b);
  });

  async function save(rule: PricingRuleRow) {
    const amount = (amounts[rule.id] ?? rule.amount).trim();
    if (amount === rule.amount) {
      toast.info("No change to save.");
      return;
    }
    setBusy(rule.id);
    try {
      const res = await fetch(`/api/admin/pricing/${rule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Pricing update failed.");
        return;
      }
      // Clear the draft so it no longer shows as dirty
      setAmounts((m) => {
        const next = { ...m };
        delete next[rule.id];
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

  if (initial.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-line bg-white text-sm text-warm-muted">
        No pricing rules found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-warm-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-pine/20" /> Global — applies to all courts unless overridden
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-flame/30" /> Court-specific — overrides global for that court
        </span>
      </div>

      {/* Court cards */}
      {sortedKeys.map((courtName) => (
        <CourtCard
          key={courtName}
          courtName={courtName}
          rules={groups[courtName] ?? []}
          amounts={amounts}
          busy={busy}
          onChange={(id, val) => setAmounts((m) => ({ ...m, [id]: val }))}
          onSave={save}
        />
      ))}
    </div>
  );
}
