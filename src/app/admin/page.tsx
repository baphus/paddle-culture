import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import InviteManager from "./invite-manager";

export default async function AdminPage() {
  const session = await requireAdmin();
  return (
    <main>
      <h1>Admin</h1>
      <nav>
        <ul>
          <li>
            <Link href="/admin/bookings">Bookings</Link>
          </li>
          <li>
            <Link href="/admin/revenue">Revenue</Link>
          </li>
          <li>
            <Link href="/admin/audit">Audit log</Link>
          </li>
          <li>
            <Link href="/admin/courts">Courts</Link>
          </li>
          <li>
            <Link href="/admin/pricing">Pricing</Link>
          </li>
          <li>
            <Link href="/admin/hours">Hours & closures</Link>
          </li>
        </ul>
      </nav>
      <InviteManager email={session.email} name={session.name} />
    </main>
  );
}
