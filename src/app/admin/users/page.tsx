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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage admin accounts and invitations.
        </p>
      </div>

      {/* Admin accounts */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        {failed ? (
          <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Could not load admin users. Check your connection and try again.
          </div>
        ) : (
          <UsersTable users={users} actorId={session.userId} />
        )}
      </section>

      {/* Invitations */}
      <section>
        <h2 className="mb-4 text-sm font-semibold">Invitations</h2>
        <div className="rounded-xl border bg-card p-5 text-card-foreground">
          <InviteManager email={session.email} name={session.name} />
        </div>
      </section>
    </div>
  );
}
