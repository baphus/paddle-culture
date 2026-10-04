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
import type { ClosureRow, CourtRow, HoursRow } from "@/lib/admin/config";
import { DAY_NAMES } from "@/lib/admin/config";

function readError(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error?: { message?: string } }).error?.message === "string"
  ) {
    return (data as { error: { message: string } }).error.message;
  }
  return fallback;
}

export default function HoursManager({
  initialHours,
  initialClosures,
  courts,
}: {
  initialHours: HoursRow[];
  initialClosures: ClosureRow[];
  courts: CourtRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Hours add form
  const [hCourt, setHCourt] = useState("");
  const [hDay, setHDay] = useState("1");
  const [hOpen, setHOpen] = useState("06:00");
  const [hClose, setHClose] = useState("03:00");

  // Closure add form
  const [cScope, setCScope] = useState<"global" | "court">("global");
  const [cCourt, setCCourt] = useState("");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cReason, setCReason] = useState("");

  async function post(url: string, body: unknown, okMsg: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return false;
      }
      toast.success(okMsg);
      router.refresh();
      return true;
    } catch {
      toast.error("Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(url: string, okMsg: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch(url, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return;
      }
      toast.success(okMsg);
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <section>
        <h2>Operating hours</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void post(
              "/api/admin/hours",
              {
                courtId: hCourt === "" ? null : hCourt,
                dayOfWeek: Number(hDay),
                openTime: hOpen,
                closeTime: hClose,
              },
              "Hours row added.",
              "hours-add",
            );
          }}
        >
          <div>
            <Label htmlFor="h-court">Court (blank = all courts)</Label>
            <select
              id="h-court"
              value={hCourt}
              onChange={(e) => setHCourt(e.target.value)}
            >
              <option value="">All courts (global)</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="h-day">Day</Label>
            <select id="h-day" value={hDay} onChange={(e) => setHDay(e.target.value)}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="h-open">Open (HH:MM)</Label>
            <Input
              id="h-open"
              value={hOpen}
              onChange={(e) => setHOpen(e.target.value)}
              placeholder="06:00"
            />
          </div>
          <div>
            <Label htmlFor="h-close">Close (HH:MM, ≤open = overnight)</Label>
            <Input
              id="h-close"
              value={hClose}
              onChange={(e) => setHClose(e.target.value)}
              placeholder="03:00"
            />
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "hours-add" ? "Adding…" : "Add hours row"}
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Court</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Open</TableHead>
              <TableHead>Close</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialHours.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.courtName}</TableCell>
                <TableCell>{DAY_NAMES[h.dayOfWeek]}</TableCell>
                <TableCell>{h.openTime}</TableCell>
                <TableCell>{h.closeTime}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => remove(`/api/admin/hours/${h.id}`, "Hours row deleted.", h.id)}
                  >
                    {busy === h.id ? "Deleting…" : "Delete"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2>Closures</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!cStart || !cEnd) {
              toast.error("Pick a start and end datetime.");
              return;
            }
            void post(
              "/api/admin/closures",
              {
                scope: cScope,
                courtId: cScope === "global" ? null : cCourt || null,
                startAt: new Date(cStart).toISOString(),
                endAt: new Date(cEnd).toISOString(),
                reason: cReason.trim() || null,
              },
              "Closure added.",
              "closure-add",
            );
          }}
        >
          <div>
            <Label htmlFor="c-scope">Scope</Label>
            <select
              id="c-scope"
              value={cScope}
              onChange={(e) => setCScope(e.target.value as "global" | "court")}
            >
              <option value="global">All courts</option>
              <option value="court">One court</option>
            </select>
          </div>
          {cScope === "court" ? (
            <div>
              <Label htmlFor="c-court">Court</Label>
              <select
                id="c-court"
                value={cCourt}
                onChange={(e) => setCCourt(e.target.value)}
              >
                <option value="">— pick —</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="c-start">Start (local time)</Label>
            <Input
              id="c-start"
              type="datetime-local"
              value={cStart}
              onChange={(e) => setCStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="c-end">End (local time)</Label>
            <Input
              id="c-end"
              type="datetime-local"
              value={cEnd}
              onChange={(e) => setCEnd(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="c-reason">Reason (optional)</Label>
            <Input
              id="c-reason"
              value={cReason}
              onChange={(e) => setCReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "closure-add" ? "Adding…" : "Add closure"}
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialClosures.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.courtName}</TableCell>
                <TableCell>{c.startAt}</TableCell>
                <TableCell>{c.endAt}</TableCell>
                <TableCell>{c.reason ?? "—"}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      remove(`/api/admin/closures/${c.id}`, "Closure lifted.", c.id)
                    }
                  >
                    {busy === c.id ? "Deleting…" : "Delete"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
