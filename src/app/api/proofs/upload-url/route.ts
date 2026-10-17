import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import {
  graceWindowMs,
  isWithinGrace,
  loadHoldRowsByOwner,
  ownerTokenCovers,
} from "@/lib/booking/hold-owner";
import {
  getStorageAdmin,
  mintProofPath,
} from "@/lib/booking/proof";
import { PROOF_BUCKET } from "@/lib/booking/constants";
import { proofUploadUrlBodySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// POST /api/proofs/upload-url
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
    // All tokens must map to holds that are still unexpired on the DB clock —
    // or, when the customer's browser was away long enough for the hold to
    // lapse, to holds their owner token still covers inside the grace window.
    // Either way this is a real hold the caller can name; the submit
    // transaction remains the only thing that decides a booking exists.
    const { data: rows, error: holdError } = await db
      .from("holds")
      .select("hold_token,expires_at,owner_token")
      .in("hold_token", parsed.data.holdTokens)
      .gt("expires_at", new Date().toISOString());

    if (holdError) return err("INTERNAL", "Could not verify holds.", 500);

    type Row = { hold_token: string; expires_at: string };
    let liveRows = (rows ?? []) as Row[];
    let deadlineMs = liveRows.length
      ? Math.min(...liveRows.map((h) => new Date(h.expires_at).getTime()))
      : 0;

    if (liveRows.length !== parsed.data.holdTokens.length) {
      const ownerToken = parsed.data.ownerToken;
      const ownedRows = ownerToken ? await loadHoldRowsByOwner(db, ownerToken) : [];
      const covered =
        ownerToken !== undefined &&
        ownerTokenCovers(ownedRows, parsed.data.holdTokens) &&
        ownedRows
          .filter((r) => parsed.data.holdTokens.includes(r.hold_token))
          .every((r) => isWithinGrace(r.expires_at));
      if (!covered) {
        return err(
          "HOLD_INVALID",
          "Upload requires live holds. Re-select your slots first.",
          409,
        );
      }
      // Grace-window upload: the URL is still short-lived, and submit will
      // only succeed once the customer reclaims the hold. Reporting the grace
      // deadline lets the payment step offer that reclaim up front.
      liveRows = ownedRows
        .filter((r) => parsed.data.holdTokens.includes(r.hold_token))
        .map((r) => ({ hold_token: r.hold_token, expires_at: r.expires_at }));
      deadlineMs = Math.min(
        ...liveRows.map((r) => new Date(r.expires_at).getTime() + graceWindowMs()),
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
