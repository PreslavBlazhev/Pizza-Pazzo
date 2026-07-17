"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { logoutUser } from "@/app/actions/auth";
import { canAccessAdmin, isUserRole, type UserRole } from "@/types/auth";
import { NAV_LINKS } from "./Header";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Hamburger navigation for mobile (< lg).
 *
 * Reads the session in the browser for the same reason as <HeaderAuth />: the
 * header must not force every page out of static rendering.
 */
export function MobileNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState<{
    status: "loading" | "signedOut" | "signedIn";
    role: UserRole;
  }>({ status: "loading", role: "customer" });

  useEffect(() => {
    const supabase = createClient();

    if (!supabase) {
      setAuth({ status: "signedOut", role: "customer" });
      return;
    }

    let active = true;

    async function loadRole(userId: string) {
      const { data } = await supabase!
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active) return;
      setAuth({
        status: "signedIn",
        role: isUserRole(data?.role) ? data.role : "customer",
      });
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (user) void loadRole(user.id);
      else setAuth({ status: "signedOut", role: "customer" });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) void loadRole(session.user.id);
      else setAuth({ status: "signedOut", role: "customer" });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const linkClass =
    "rounded-xl px-3 py-3 text-base font-medium text-pizza-ink transition hover:bg-pizza-green-light hover:text-pizza-green-dark";

  return (
    <div className="lg:hidden">
      <button
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-pizza-cream-dark bg-white text-xl text-pizza-ink shadow-sm"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 top-20 z-30 bg-pizza-ink/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav
            className="absolute left-0 right-0 top-full z-40 flex flex-col gap-1 border-b border-pizza-cream-dark bg-pizza-cream px-4 py-4 shadow-soft"
            aria-label={t("mobileNav")}
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {t(l.labelKey)}
              </Link>
            ))}
            <Link href="/cart" className={linkClass} onClick={() => setOpen(false)}>
              🛒 {t("cart")}
            </Link>

            <span className="my-2 h-px bg-pizza-cream-dark" aria-hidden />

            <div className="px-3 py-2">
              <LanguageSwitcher />
            </div>

            <span className="my-2 h-px bg-pizza-cream-dark" aria-hidden />

            {auth.status === "signedIn" ? (
              <>
                {canAccessAdmin(auth.role) && (
                  <Link
                    href="/admin"
                    className="rounded-xl bg-pizza-red-light px-3 py-3 text-base font-semibold text-brand-dark"
                    onClick={() => setOpen(false)}
                  >
                    🛠 {t("admin")}
                  </Link>
                )}
                <Link href="/profile" className={linkClass} onClick={() => setOpen(false)}>
                  {t("profile")}
                </Link>
                <form action={logoutUser}>
                  <button type="submit" className={`${linkClass} w-full text-left`}>
                    {t("logout")}
                  </button>
                </form>
              </>
            ) : auth.status === "signedOut" ? (
              <>
                <Link href="/auth/login" className={linkClass} onClick={() => setOpen(false)}>
                  {t("login")}
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-xl bg-pizza-green px-3 py-3 text-center text-base font-semibold text-white"
                  onClick={() => setOpen(false)}
                >
                  {t("register")}
                </Link>
              </>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
