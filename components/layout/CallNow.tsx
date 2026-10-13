import { getTranslations } from "next-intl/server";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import { telHref } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

/**
 * The restaurant's public phone, as tappable links.
 *
 * Both components read the SAME number — `primaryPhone` from the settings row
 * (Admin → Settings), with lib/constants.ts as the fallback — so the line
 * under the logo, the "Call now" buttons, the footer and the contacts page can
 * never disagree. Server components: the read is cached and tag-invalidated,
 * like the footer's.
 */
async function publicPhone(): Promise<string> {
  return (await getRestaurantSettings()).primaryPhone;
}

/**
 * The number itself, next to or under a logo.
 *
 * `size="hero"`: under the big homepage logo — large and bold, the first thing
 * to tap, but still lighter than the logo above it. `size="bar"`: beside the
 * small logo in the header, on the same line.
 */
export async function LogoPhone({
  size = "bar",
  className,
}: {
  size?: "hero" | "bar";
  className?: string;
}) {
  const t = await getTranslations("callNow");
  const phone = await publicPhone();

  return (
    <a
      href={telHref(phone)}
      aria-label={t("ariaLabel", { phone })}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full tabular-nums text-pizza-green-dark transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2",
        size === "hero"
          ? "gap-2 px-3 py-1 text-3xl font-bold tracking-wide sm:text-4xl lg:text-[2rem]"
          : "gap-1 text-[0.95rem] font-bold leading-none sm:text-base",
        className
      )}
    >
      {/* In the narrow header the icon is the first thing to go. */}
      <span aria-hidden className={size === "bar" ? "hidden min-[400px]:inline" : undefined}>
        📞
      </span>
      {phone}
    </a>
  );
}

/**
 * "Обади се сега" / "Call now". At least 48px tall, so it is an easy target
 * for a thumb, and in the normal flow of the page — never floating over
 * other content.
 */
export async function CallNowButton({
  tone = "brand",
  className,
}: {
  /** "brand": red on light backgrounds; "light": white on the green band. */
  tone?: "brand" | "light";
  className?: string;
}) {
  const t = await getTranslations("callNow");
  const phone = await publicPhone();

  return (
    <a
      href={telHref(phone)}
      aria-label={t("ariaLabel", { phone })}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-8 py-3.5 font-semibold shadow-soft transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        tone === "brand"
          ? "bg-pizza-green text-white hover:bg-pizza-green-dark focus-visible:ring-pizza-green/40"
          : "border-2 border-white bg-transparent text-white hover:bg-white hover:text-pizza-green focus-visible:ring-white/60 focus-visible:ring-offset-pizza-green",
        className
      )}
    >
      <span aria-hidden>📞</span>
      {t("button")}
    </a>
  );
}
