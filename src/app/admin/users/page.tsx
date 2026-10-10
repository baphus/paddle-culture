import PageHeader from "@/components/admin/page-header";
import { listAdminUsers } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/admin/session";
import InviteManager from "../invite-manager";
import UsersTable from "./users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireAdmin();

  let users: Awaited<ReturnType<typeof listAdminUsers>> = [];
  let failed = false;
  try {
    users = await listAdminUsers();
  } catch (e) {
    console.error("[users] data fetch failed:", e);
    failed = true;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Users"
        description="Manage admin accounts and invitations."
      />

      {/* Admin accounts */}
      <section className="overflow-hidden rounded-xl border border-line bg-white">
        {failed ? (
          <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-warm-muted">
            Could not load admin users. Check your connection and try again.
          </div>
        ) : (
          <UsersTable users={users} actorId={session.userId} />
        )}
      </section>

      {/* Invitations */}
      <section>
        <h2 className="mb-4 text-sm font-bold text-ink">Invitations</h2>
        <div className="rounded-xl border border-line bg-white p-5">
          <InviteManager email={session.email} name={session.name} />
        </div>
      </section>
    </div>
  );
}
