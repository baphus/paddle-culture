"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CourtRow } from "@/lib/admin/config";

export default function CourtsManager({ initial }: { initial: CourtRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function addCourt(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter a court name.");
      return;
    }
    setBusy("add");
    try {
      const res = await fetch("/api/admin/courts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Court creation failed.");
        return;
      }
      toast.success("Court added.");
      setName("");
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
    <div className="space-y-5">
      {/* Add form */}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="mb-3 text-sm font-bold text-ink">Add court</p>
        <form onSubmit={addCourt} className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="court-name" className="text-xs font-semibold text-ink/70">
              Court name
            </Label>
            <Input
              id="court-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Court 3"
              className="h-9 rounded-lg border-line text-sm"
            />
          </div>
          <Button
            type="submit"
            disabled={busy !== null}
            className="h-9 shrink-0 rounded-lg bg-flame px-4 text-xs font-bold text-white hover:bg-flame-hover"
          >
            <PlusCircle className="mr-1.5 size-3.5" />
            {busy === "add" ? "Adding…" : "Add court"}
          </Button>
        </form>
      </div>

      {/* Courts table */}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {initial.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-oat/60 hover:bg-oat/60">
                <TableHead className="text-xs font-bold text-ink/60">Name</TableHead>
                <TableHead className="text-xs font-bold text-ink/60">Status</TableHead>
                <TableHead className="text-xs font-bold text-ink/60">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initial.map((c) => (
                <TableRow key={c.id} className="border-line">
                  <TableCell className="font-medium text-ink">{c.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        c.status === "active"
                          ? "bg-live text-pine"
                          : "bg-oat text-warm-muted"
                      }`}
                    >
                      {c.status === "active" && (
                        <span className="size-1.5 rounded-full bg-live-dot" aria-hidden />
                      )}
                      {c.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => flip(c)}
                      className={`h-7 rounded-lg border-line text-xs font-semibold ${
                        c.status === "active"
                          ? "hover:border-error/30 hover:bg-error/5 hover:text-error"
                          : "hover:border-pine/30 hover:bg-pine/5 hover:text-pine"
                      }`}
                    >
                      {busy === c.id
                        ? "Saving…"
                        : c.status === "active"
                          ? "Deactivate"
                          : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-warm-muted">
            No courts yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
