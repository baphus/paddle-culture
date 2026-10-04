"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PricingRuleRow } from "@/lib/admin/config";

export default function PricingManager({ initial }: { initial: PricingRuleRow[] }) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function save(rule: PricingRuleRow) {
    const amount = (amounts[rule.id] ?? rule.amount).trim();
    if (amount === rule.amount) {
      toast.error("No change to save.");
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
      toast.success("Rate updated.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Court</TableHead>
          <TableHead>Day</TableHead>
          <TableHead>Band</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Amount (₱)</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {initial.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.courtName}</TableCell>
            <TableCell>{r.dayType}</TableCell>
            <TableCell>{r.timeBand}</TableCell>
            <TableCell>{r.itemType}</TableCell>
            <TableCell>{r.unit}</TableCell>
            <TableCell>
              <Input
                aria-label={`Amount for ${r.courtName} ${r.dayType} ${r.timeBand} ${r.itemType}`}
                defaultValue={r.amount}
                inputMode="decimal"
                onChange={(e) =>
                  setAmounts((m) => ({ ...m, [r.id]: e.target.value }))
                }
              />
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => save(r)}
              >
                {busy === r.id ? "Saving…" : "Save"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
