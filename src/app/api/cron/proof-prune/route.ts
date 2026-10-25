import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isCronAuthorized } from "@/lib/cron/auth";
import { PROOF_BUCKET, PROOF_RETENTION_DAYS } from "@/lib/booking/constants";
import { getStorageAdmin } from "@/lib/booking/proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel proof-prune cron (vercel.json: 1st of the month 03:00 UTC).
// Deletes payment_proofs rows older than PROOF_RETENTION_DAYS, then the
// matching objects in the private `proofs` bucket. DB row first — an object
// with no row is invisible to the app, a row with no object is not.
//
// shortcut: the rows are gone before the files, so a failed Storage remove
// leaves orphans that no re-run can find; the paths are logged for manual
// cleanup. Move to a pending-deletes table if Storage flakiness ever bites.

const STORAGE_REMOVE_BATCH = 100;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const cutoff = new Date(
      Date.now() - PROOF_RETENTION_DAYS * 86_400_000,
    ).toISOString();

    const { data, error } = await getDb().rpc("rpc_delete_expired_proofs", {
      p_cutoff: cutoff,
    });
    if (error) throw error;

    const paths: string[] = (data ?? []).flatMap(
      (row: { deleted_paths: string[] | null }) => row.deleted_paths ?? [],
    );

    const storage = getStorageAdmin();
    let removed = 0;
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
      const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH);
      const { error: storageError } = await storage.storage
        .from(PROOF_BUCKET)
        .remove(batch);
      if (storageError) {
        console.error("proof-prune storage removal failed", batch, storageError);
        continue;
      }
      removed += batch.length;
    }

    const failed = paths.length - removed;
    if (failed > 0) {
      return NextResponse.json(
        { ok: false, purgedProofs: paths.length, filesRemoved: removed, filesFailed: failed },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, purgedProofs: paths.length });
  } catch (e) {
    console.error("vercel proof-prune cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
