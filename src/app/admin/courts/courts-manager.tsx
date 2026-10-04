"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
    <div>
      <form onSubmit={addCourt}>
        <div>
          <Label htmlFor="court-name">New court name</Label>
          <Input
            id="court-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Court 3"
          />
        </div>
        <Button type="submit" disabled={busy !== null}>
          {busy === "add" ? "Adding…" : "Add court"}
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initial.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.status}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => flip(c)}
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
    </div>
  );
}
