import { listAdminUsers } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/admin/session";
import InviteManager from "../invite-manager";
import AddUserDialog from "./add-user-dialog";
import UsersTable from "./users-table";

export const dynamic = "force-dynamic";

// Shown under the page title on every render path (loading, error, ready).
const PAGE_DESCRIPTION =
  "Manage admin accounts and invitations.";

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
        <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
      </div>

      {/* Admin accounts */}
      <section>
        {failed ? (
          <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Could not load admin users. Check your connection and try again.
          </div>
        ) : (
          <UsersTable
            users={users}
            currentUserId={session.userId}
            actions={
              <div className="flex flex-wrap gap-2">
                <AddUserDialog />
                <InviteManager />
              </div>
            }
          />
        )}
      </section>
    </div>
  );
}
