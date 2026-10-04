import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { processOutboxBatch } from "@/lib/mail/worker";

export const runtime = "nodejs";

// POST /api/admin/outbox/process — admin-only manual trigger for the outbox
// worker (same code path as the */5 cron). Used for the Gmail smoke test and
// on-demand drains; returns per-batch counts. Never called by booking flows
// (ADR-05: never inline sends).
export async function POST() {
  try {
    await requireAdmin();
    const result = await processOutboxBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("manual outbox run failed", e);
    return err("INTERNAL", "Outbox run failed.", 500);
  }
}
