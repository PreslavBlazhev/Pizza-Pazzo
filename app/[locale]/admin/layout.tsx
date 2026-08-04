import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { requireRole } from "@/lib/auth";
import { getStoreStatus } from "@/lib/store-status";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Never prerender the admin panel — it reads the session cookie, which is a
 * per-request dynamic API. Applies to every segment under /admin.
 */
export const dynamic = "force-dynamic";

/**
 * Admin shell.
 *
 * `requireRole` runs before any admin page renders, so even if the middleware
 * matcher were changed by mistake, /admin stays closed to customers. This is
 * the second of two layers — the Edge middleware and this server-side guard.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessionUser = await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);
  // The layout is already force-dynamic, so this is re-read on every admin
  // navigation and after `router.refresh()` — which is how the closure button
  // updates itself without any client-side polling.
  const storeStatus = await getStoreStatus();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-pizza-cream">
      <AdminSidebar sessionUser={sessionUser} storeStatus={storeStatus} />
      <div className="flex-1 overflow-x-auto p-4 sm:p-8">{children}</div>
    </div>
  );
}
