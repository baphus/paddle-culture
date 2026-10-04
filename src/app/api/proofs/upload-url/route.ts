import { and, gt, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { holds } from "@/db/schema";
import { LaneError, err } from "@/lib/booking/errors";
import {
  getStorageAdmin,
  mintProofPath,
} from "@/lib/booking/proof";
import { PROOF_BUCKET } from "@/lib/booking/constants";
import { proofUploadUrlBodySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// POST /api/proofs/upload-url — CUSTOMER-facing, unauthenticated (customers
// must upload). Abuse controls:
//   - bound to live hold tokens: all tokens must exist AND be unexpired
//     (server clock); no holds = no URL, so URLs cannot be farmed;
//   - scoped path: server-minted `incoming/<random>.<ext>` only; no
//     client-chosen paths, and upsert:false so uploads are immutable
//     (no replace possible);
//   - mime/bytes pre-validated here AND re-verified from Storage metadata at
//     submit (the hard gate); the bucket itself enforces 5MB + allowlist.
// Client then PUTs raw file bytes DIRECTLY to `signedUrl` (browser → Supabase,
// never through a route handler — Netlify buffers 6MB), and submits with
// { path, mime, bytes }.
export async function POST(request: Request) {
  try {
    const parsed = proofUploadUrlBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    if (new Set(parsed.data.holdTokens).size !== parsed.data.holdTokens.length) {
      return err("DUPLICATE_HOLD_TOKEN", "Duplicate hold tokens in request.", 400);
    }
    // All tokens must map to holds that are still unexpired on the DB clock.
    const rows = await db
      .select({ expiresAt: holds.expiresAt })
      .from(holds)
      .where(
        and(
          inArray(holds.holdToken, parsed.data.holdTokens),
          gt(holds.expiresAt, sql`now()`),
        ),
      );
    if (rows.length !== parsed.data.holdTokens.length) {
      return err(
        "HOLD_INVALID",
        "Upload requires live holds. Re-select your slots first.",
        409,
      );
    }

    const path = mintProofPath(parsed.data.mime);
    const supabase = getStorageAdmin();
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.signedUrl) {
      return err("UPLOAD_URL_FAILED", "Could not prepare upload. Retry shortly.", 500);
    }
    const deadlineMs = Math.min(...rows.map((h) => h.expiresAt.getTime()));
    return NextResponse.json(
      { path, signedUrl: data.signedUrl, token: data.token, deadlineMs },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("upload-url failed", e);
    return err("INTERNAL", "Could not prepare upload.", 500);
  }
}
