import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADMIN_NAV } from "@/lib/constants";
import { UserRoleBadge } from "@/components/admin/UserRoleBadge";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { SessionUser } from "@/types/auth";

/**
 * Admin navigation.
 *
 * Links the current role may not open are hidden — but that is only tidiness.
 * The enforcement lives in `middleware.ts` and in each action's role guard.
 */
export function AdminSidebar({ sessionUser }: { sessionUser: SessionUser }) {
  const t = useTranslations("admin");
  const links = ADMIN_NAV.filter((item) =>
    (item.allow as readonly string[]).includes(sessionUser.role)
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-pizza-cream-dark bg-white">
      <div className="border-b border-pizza-cream-dark px-5 py-5">
        <Link href="/" className="font-display text-lg font-bold text-brand">
          Pizza Pazzo
        </Link>
        <p className="mt-0.5 text-xs uppercase tracking-wide text-pizza-muted">
          {t("title")}
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label={t("title")}>
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-pizza-ink transition hover:bg-pizza-green-light hover:text-pizza-green-dark"
          >
            {t(`nav.${item.labelKey}`)}
          </Link>
        ))}
      </nav>

      <div className="border-t border-pizza-cream-dark p-4">
        <p className="truncate text-sm font-medium text-pizza-ink">
          {sessionUser.fullName || sessionUser.email}
        </p>
        <div className="mt-1.5">
          <UserRoleBadge role={sessionUser.role} />
        </div>
        <LogoutButton className="mt-3 w-full" />
      </div>
    </aside>
  );
}
