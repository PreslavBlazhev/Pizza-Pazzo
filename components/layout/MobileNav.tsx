"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logoutUser } from "@/app/actions/auth";
import { canAccessAdmin, isUserRole, type UserRole } from "@/types/auth";

const links = [
  { href: "/", label: "Начало" },
  { href: "/menu", label: "Меню" },
  { href: "/gallery", label: "Галерия" },
  { href: "/reviews", label: "Отзиви" },
  { href: "/contacts", label: "Контакти" },
  { href: "/cart", label: "🛒 Количка" },
];

/**
 * Hamburger navigation for mobile (< lg).
 *
 * Reads the session in the browser for the same reason as <HeaderAuth />: the
 * header must not force every page out of static rendering.
 */
export function MobileNav() {
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
        aria-label={open ? "Затвори менюто" : "Отвори менюто"}
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
            aria-label="Мобилна навигация"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}

            <span className="my-2 h-px bg-pizza-cream-dark" aria-hidden />

            {auth.status === "signedIn" ? (
              <>
                {canAccessAdmin(auth.role) && (
                  <Link
                    href="/admin"
                    className="rounded-xl bg-pizza-red-light px-3 py-3 text-base font-semibold text-brand-dark"
                    onClick={() => setOpen(false)}
                  >
                    🛠 Админ панел
                  </Link>
                )}
                <Link href="/profile" className={linkClass} onClick={() => setOpen(false)}>
                  Профил
                </Link>
                <form action={logoutUser}>
                  <button type="submit" className={`${linkClass} w-full text-left`}>
                    Изход
                  </button>
                </form>
              </>
            ) : auth.status === "signedOut" ? (
              <>
                <Link href="/auth/login" className={linkClass} onClick={() => setOpen(false)}>
                  Вход
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-xl bg-pizza-green px-3 py-3 text-center text-base font-semibold text-white"
                  onClick={() => setOpen(false)}
                >
                  Регистрация
                </Link>
              </>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
