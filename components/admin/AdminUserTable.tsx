"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { UserRoleBadge } from "./UserRoleBadge";
import { ChangeUserRoleForm } from "./ChangeUserRoleForm";
import { CreateAdminUserForm } from "./CreateAdminUserForm";
import {
  ADMIN_USER_FILTER_LABELS,
  ADMIN_USER_FILTER_ROLES,
  type AdminUser,
  type AdminUserFilter,
} from "@/types/admin";
import { cn, formatDateTime } from "@/lib/utils";

const FILTERS: AdminUserFilter[] = ["all", "customers", "staff", "admins"];

/**
 * Users table with role filters.
 *
 * `canManageRoles` only hides controls — every action re-checks the caller's
 * role on the server, so a user who forges their way to a form still fails.
 */
export function AdminUserTable({
  users,
  canManageRoles,
}: {
  users: AdminUser[];
  canManageRoles: boolean;
}) {
  const [filter, setFilter] = useState<AdminUserFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const filtered = useMemo(
    () => users.filter((u) => ADMIN_USER_FILTER_ROLES[filter].includes(u.role)),
    [users, filter]
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f,
          users.filter((u) => ADMIN_USER_FILTER_ROLES[f].includes(u.role)).length,
        ])
      ) as Record<AdminUserFilter, number>,
    [users]
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Филтър по роля">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                filter === f
                  ? "border-pizza-green bg-pizza-green text-white"
                  : "border-pizza-cream-dark bg-white text-pizza-ink hover:border-pizza-green/50"
              )}
            >
              {ADMIN_USER_FILTER_LABELS[f]}
              <span className={cn("ml-1.5", filter === f ? "text-white/70" : "text-pizza-muted")}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        {canManageRoles && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
          >
            + Създай админ профил
          </button>
        )}
      </div>

      {/* Table — scrolls horizontally on small screens instead of squashing. */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-pizza-cream-dark bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-pizza-cream-dark bg-pizza-cream/50">
            <tr className="text-xs uppercase tracking-wide text-pizza-muted">
              <th className="px-5 py-3 font-semibold">Име</th>
              <th className="px-5 py-3 font-semibold">Имейл</th>
              <th className="px-5 py-3 font-semibold">Телефон</th>
              <th className="px-5 py-3 font-semibold">Роля</th>
              <th className="px-5 py-3 font-semibold">Създаден</th>
              {canManageRoles && <th className="px-5 py-3 text-right font-semibold">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canManageRoles ? 6 : 5}
                  className="px-5 py-12 text-center text-pizza-muted"
                >
                  Няма потребители в тази категория.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-pizza-cream-dark/60 last:border-0 hover:bg-pizza-cream/30"
                >
                  <td className="px-5 py-4 font-medium text-pizza-ink">{user.fullName || "—"}</td>
                  <td className="px-5 py-4 text-pizza-muted">{user.email}</td>
                  <td className="px-5 py-4 text-pizza-muted">{user.phone || "—"}</td>
                  <td className="px-5 py-4">
                    <UserRoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-4 text-pizza-muted">
                    {formatDateTime(user.createdAt)}
                  </td>
                  {canManageRoles && (
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        disabled={user.role === "SUPER_ADMIN"}
                        className="rounded-full border border-pizza-cream-dark px-3.5 py-1.5 text-xs font-semibold text-pizza-ink transition hover:border-pizza-green hover:text-pizza-green disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          user.role === "SUPER_ADMIN"
                            ? "Ролята на главен администратор се променя само през базата."
                            : undefined
                        }
                      >
                        Промени роля
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Създай служебен профил">
        <CreateAdminUserForm onDone={() => setCreating(false)} />
      </Modal>

      <Modal
        open={editingUser !== null}
        onClose={() => setEditingUser(null)}
        title="Промяна на роля"
      >
        {editingUser && (
          <ChangeUserRoleForm user={editingUser} onDone={() => setEditingUser(null)} />
        )}
      </Modal>
    </div>
  );
}
