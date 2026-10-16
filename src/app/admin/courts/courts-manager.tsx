"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>Add court</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addCourt} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-name">Court name</Label>
              <Input
                id="court-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="e.g. Court 3"
              />
            </div>
            <Button type="submit" disabled={busy !== null}>
              <PlusCircle />
              {busy === "add" ? "Adding…" : "Add court"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Courts table */}
      <Card>
        {initial.length > 0 ? (
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
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
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
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No courts yet. Add one above.
          </div>
        )}
      </Card>
    </div>
  );
}
