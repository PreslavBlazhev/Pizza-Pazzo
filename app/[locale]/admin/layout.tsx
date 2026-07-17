import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { requireRole } from "@/lib/auth";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Never prerender the admin panel.
 *
 * Without this, a build that runs with no Supabase env keys never reaches
 * `cookies()` (the client short-circuits to null), so Next sees no dynamic API,
 * prerenders these pages, and bakes in the signed-out redirect for everyone.
 * Applies to every segment under /admin.
 */
export const dynamic = "force-dynamic";

/**
 * Admin shell.
 *
 * `requireRole` runs before any admin page renders, so even if the middleware
 * matcher were changed by mistake, /admin stays closed to customers. This is
 * the second of three layers — middleware, this guard, and RLS in the database.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessionUser = await requireRole(["staff", "admin", "super_admin"]);

  return (
    <div className="flex min-h-screen bg-pizza-cream">
      <AdminSidebar sessionUser={sessionUser} />
      <div className="flex-1 overflow-x-auto p-6 sm:p-8">{children}</div>
    </div>
  );
}
