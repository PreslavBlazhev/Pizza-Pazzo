import { useTranslations } from "next-intl";
import { logoutUser } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Sign-out control.
 *
 * A form posting to a server action rather than an onClick handler: it needs no
 * client JS, so this stays a server component and works even before hydration.
 */
export function LogoutButton({
  className,
  children,
}: {
  className?: string;
  /** Overrides the default "Sign out" label. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("nav");

  return (
    <form action={logoutUser}>
      <button
        type="submit"
        className={cn(
          "rounded-full border border-pizza-cream-dark bg-white px-5 py-2.5 text-sm font-semibold text-pizza-ink transition hover:border-brand hover:text-brand",
          className
        )}
      >
        {children ?? t("logout")}
      </button>
    </form>
  );
}
