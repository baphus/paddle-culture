import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
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
    // All tokens must map to holds that are still unexpired on the DB clock.
    const { data: rows, error: holdError } = await db
      .from("holds")
      .select("expires_at")
      .in("hold_token", parsed.data.holdTokens)
      .gt("expires_at", new Date().toISOString());

    if (holdError) return err("INTERNAL", "Could not verify holds.", 500);
    if ((rows ?? []).length !== parsed.data.holdTokens.length) {
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
    const deadlineMs = Math.min(
      ...(rows as { expires_at: string }[]).map((h) => new Date(h.expires_at).getTime()),
    );
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
