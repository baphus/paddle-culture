import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { getAdminSession } from "@/lib/admin/session";

// Admin pages render per-request (session-guarded): never prerendered.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login?next=/admin");

  return (
    <AdminShell email={session.email} name={session.name}>
      {children}
    </AdminShell>
  );
}
