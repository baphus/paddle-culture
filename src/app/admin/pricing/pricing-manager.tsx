"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  return (
    <Badge variant={dayType === "weekday" ? "secondary" : "outline"}>
      {labelFor(dayType)}
    </Badge>
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
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-card-foreground">
      {/* Labels */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <DayTypePill dayType={rule.dayType} />
          <span className="text-xs text-muted-foreground">{labelFor(rule.timeBand)}</span>
          <span className="text-xs font-medium capitalize">{labelFor(rule.itemType)}</span>
          <span className="text-xs text-muted-foreground">{labelFor(rule.unit)}</span>
        </div>
      </div>

      {/* Amount input */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">₱</span>
        <Input
          aria-label={`Rate for ${rule.courtName} ${rule.dayType} ${rule.timeBand} ${rule.itemType}`}
          value={current}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-8 w-24 text-right font-semibold tabular-nums",
            isDirty && "border-ring ring-1 ring-ring/30",
          )}
        />
        <Button
          size="sm"
          disabled={!isDirty || busy}
          onClick={onSave}
          className={cn(!isDirty && "invisible")}
          aria-label="Save rate"
        >
          {busy ? "…" : <Save />}
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

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [rules],
  );

  // Count unsaved changes in this card
  const dirtyCount = rules.filter((r) => {
    const draft = amounts[r.id];
    return draft !== undefined && draft.trim() !== r.amount;
  }).length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground">
      {/* Card header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          {/* Court icon */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium">
            {isGlobal ? "🌐" : courtName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{courtName}</p>
            <p className="text-xs text-muted-foreground">
              {rules.length} rate{rules.length !== 1 ? "s" : ""}
              {dirtyCount > 0 && (
                <span className="ml-2 font-medium text-foreground">
                  {dirtyCount} unsaved
                </span>
              )}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Rule rows */}
      {open && (
        <div className="space-y-2 border-t px-4 py-4">
          {sortedRules.map((rule) => (
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
  const groups = useMemo(
    () =>
      initial.reduce<Record<string, PricingRuleRow[]>>((acc, r) => {
        const key = r.courtName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {}),
    [initial],
  );

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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No pricing rules found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-muted-foreground/30" /> Global — applies to all courts unless overridden
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-muted-foreground/60" /> Court-specific — overrides global for that court
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
