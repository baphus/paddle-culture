import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";

// Admin pages render per-request (session-guarded): never prerendered.
export const dynamic = "force-dynamic";

// Server-side guard for every /admin route: unauthenticated (or non-admin /
// deactivated) visitors bounce to /login. Proxy.ts already redirects, this is
// the defense-in-depth check that cannot be bypassed client-side.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login?next=/admin");
  return <>{children}</>;
}
