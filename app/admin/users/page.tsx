import type { Metadata } from "next";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { FormAlert } from "@/components/ui/FormAlert";
import { getAllUsers } from "@/app/actions/admin-users";
import { requireRole } from "@/lib/auth";
import { isSuperAdmin } from "@/types/auth";

export const metadata: Metadata = {
  title: "Потребители",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  // Middleware already restricts /admin/users to admin+, but a page that reads
  // personal data should not depend on the matcher being right.
  const sessionUser = await requireRole(["admin", "super_admin"]);

  const { users, error, notConfigured } = await getAllUsers();

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
          Потребители
        </h1>
        <p className="mt-1.5 text-sm text-pizza-muted">
          Профили и роли. Само главен администратор може да променя роли и да
          създава служебни профили.
        </p>
      </div>

      {notConfigured ? (
        <FormAlert tone="info">
          Supabase не е конфигуриран. Добавете env keys в <code>.env.local</code>{" "}
          и пуснете <code>docs/supabase-auth-schema.sql</code>.
        </FormAlert>
      ) : error ? (
        <FormAlert tone="error">{error}</FormAlert>
      ) : (
        <AdminUserTable users={users} canManageRoles={isSuperAdmin(sessionUser.role)} />
      )}
    </div>
  );
}
