import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { createProofReadUrl } from "@/lib/booking/proof";
import { requireAdmin } from "@/lib/admin/session";

export const runtime = "nodejs";

// GET /api/admin/proofs/read?path=incoming/<hex>.<ext>[&download=1] — admin
// only. Mints a short-lived signed read URL (view/zoom; download=1 forces
// attachment). Contract for the admin table lane: fetch this per proof,
// render signedUrl in <img>/link; never expose the service key or bucket
// paths publicly. No replace/delete endpoints exist by design (ADR-06).
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sp = new URL(request.url).searchParams;
    const path = sp.get("path") ?? "";
    const download = sp.get("download") === "1";
    const { signedUrl, expiresIn } = await createProofReadUrl(path, { download });
    return NextResponse.json({ signedUrl, expiresIn });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("proof read failed", e);
    return err("INTERNAL", "Could not open payment proof.", 500);
  }
}
