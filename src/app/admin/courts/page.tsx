import Link from "next/link";
import { getDb } from "@/db/client";
import { listCourts } from "@/lib/admin/config";
import CourtsManager from "./courts-manager";

export const dynamic = "force-dynamic";

export default async function CourtsPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <main>
        <h1>Courts</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const courts = await listCourts(db);
  return (
    <main>
      <h1>Courts</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <p>
        Inactive courts disappear from booking but keep all history (slots join
        by id). Every change is audit-logged.
      </p>
      <CourtsManager initial={courts} />
    </main>
  );
}
