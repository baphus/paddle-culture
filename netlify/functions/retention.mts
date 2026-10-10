import type { HandlerResponse } from "@netlify/functions";
import { getDb } from "../../src/db/client";

// Retention purge (see docs/BACKUPS.md §7 "Retention purge").
// Weekly: deletes ONLY expired holds older than HOLD_GRACE_HOURS via an RPC
// (rpc_delete_expired_holds) — no persistent TCP socket.
// Relative imports only — Netlify bundles this with esbuild.

export const RETENTION_HOLD_GRACE_HOURS = 24;

export const config = { schedule: "0 2 * * 0" };

export default async (): Promise<HandlerResponse> => {
  try {
    const db = getDb();
    const cutoff = new Date(
      Date.now() - RETENTION_HOLD_GRACE_HOURS * 3_600_000,
    ).toISOString();

    const { data, error } = await db.rpc("rpc_delete_expired_holds", {
      p_cutoff: cutoff,
    });
    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, purgedHolds: data ?? 0 }),
    };
  } catch (e) {
    console.error("retention purge failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false }),
    };
  }
};
