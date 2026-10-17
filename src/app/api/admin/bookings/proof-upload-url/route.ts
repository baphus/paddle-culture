import { NextResponse } from "next/server";
import { PROOF_BUCKET } from "@/lib/booking/constants";
import { LaneError, err } from "@/lib/booking/errors";
import { getStorageAdmin, mintProofPath } from "@/lib/booking/proof";
import { adminProofUploadUrlBodySchema } from "@/lib/booking/validation";
import { requireAdmin } from "@/lib/admin/session";

export const runtime = "nodejs";

// POST /api/admin/bookings/proof-upload-url (Q14)
//
// Fork of POST /api/proofs/upload-url with the hold-token gate removed: the
// admin path has no holds, and the endpoint is gated by requireAdmin()
// instead. The returned path is scoped (`incoming/<hex>.<ext>`) exactly like
// the customer one, so verifyProofFile() validates it the same way at submit.
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const parsed = adminProofUploadUrlBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }

    const path = mintProofPath(parsed.data.mime);
    const { data, error } = await getStorageAdmin()
      .storage.from(PROOF_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data?.signedUrl) {
      return err("UPLOAD_URL_FAILED", "Could not prepare upload. Retry shortly.", 500);
    }

    // No deadline: there is no hold to expire against. The upload URL's own
    // signed-upload TTL is the only clock.
    return NextResponse.json(
      { path, signedUrl: data.signedUrl, token: data.token },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("[POST /api/admin/bookings/proof-upload-url]", e);
    return err("INTERNAL", "Could not prepare upload.", 500);
  }
}
