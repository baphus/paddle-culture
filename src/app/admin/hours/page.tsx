import Link from "next/link";
import { getDb } from "@/db/client";
import { listClosures, listCourts, listHours } from "@/lib/admin/config";
import HoursManager from "./hours-manager";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <main>
        <h1>Hours & closures</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const [hours, closures, courts] = await Promise.all([
    listHours(db),
    listClosures(db),
    listCourts(db),
  ]);
  return (
    <main>
      <h1>Hours & closures</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <p role="note">
        Default-OPEN rule: a court with <strong>zero</strong> hours rows is
        treated as open for the whole operating day (overnight spill from the
        previous day counts too). Add rows to restrict a court&apos;s hours;
        deleting a court&apos;s last row re-opens it fully. Closures always
        beat operating hours.
      </p>
      <HoursManager initialHours={hours} initialClosures={closures} courts={courts} />
    </main>
  );
}
