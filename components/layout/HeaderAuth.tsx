"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { logoutUser } from "@/app/actions/auth";
import { canAccessAdmin, isUserRole, type UserRole } from "@/types/auth";
import { cn } from "@/lib/utils";

/**
 * Auth controls in the site header.
 *
 * Deliberately a **client** component. The Header is on every page, including
 * the statically rendered / and /menu; reading the session on the server would
 * opt those pages out of static rendering and put a Supabase round-trip in
 * front of the menu. Instead the session is read in the browser after hydration.
 *
 * The cost is a brief moment with no auth buttons on first paint. That is fine
 * here: nothing on the public site depends on them, and the routes that do care
 * are protected by middleware, not by hiding a link.
 */
export function HeaderAuth({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const [state, setState] = useState<{
    status: "loading" | "signedOut" | "signedIn";
    role: UserRole;
  }>({ status: "loading", role: "customer" });

  useEffect(() => {
    const supabase = createClient();

    // No Supabase keys → behave as a guest rather than crash.
    if (!supabase) {
      setState({ status: "signedOut", role: "customer" });
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
      setState({
        status: "signedIn",
        role: isUserRole(data?.role) ? data.role : "customer",
      });
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (user) void loadRole(user.id);
      else setState({ status: "signedOut", role: "customer" });
    });

    // Keeps the header in sync across tabs and after login/logout.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) void loadRole(session.user.id);
      else setState({ status: "signedOut", role: "customer" });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Reserve the space so the header does not jump when the state resolves.
  if (state.status === "loading") {
    return <div className={cn("h-10 w-32", className)} aria-hidden />;
  }

  if (state.status === "signedOut") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Link
          href="/auth/login"
          className="rounded-full px-4 py-2 text-base font-semibold text-pizza-ink/80 transition hover:text-brand"
        >
          {t("login")}
        </Link>
        <Link
          href="/auth/register"
          className="rounded-full border border-pizza-green/40 bg-white px-4 py-2 text-base font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
        >
          {t("register")}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {canAccessAdmin(state.role) && (
        <Link
          href="/admin"
          className="rounded-full border border-brand/30 bg-pizza-red-light px-4 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white"
        >
          {t("admin")}
        </Link>
      )}
      <Link
        href="/profile"
        className="rounded-full px-4 py-2 text-base font-semibold text-pizza-ink/80 transition hover:text-brand"
      >
        {t("profile")}
      </Link>
      <form action={logoutUser}>
        <button
          type="submit"
          className="rounded-full border border-pizza-cream-dark bg-white px-4 py-2 text-base font-semibold text-pizza-ink transition hover:border-brand hover:text-brand"
        >
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
