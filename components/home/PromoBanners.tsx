import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The two printed promo boards, rebuilt in markup.
 *
 * Everything here is real text in a coloured panel — no image of a banner, no
 * canvas, no SVG text — so the offers stay selectable, translatable and sharp
 * at any size. The whole board is one link to the menu; there is no pricing
 * logic behind them, they are display only.
 *
 * The two content blocks are exported separately because the desktop layout
 * puts one on each side of the hero, while narrow screens scroll through both
 * in a snap carousel.
 */

/** The brand mark, forced to solid white for use on the coloured panels.
 *  `brightness-0 invert` flattens the red/green artwork to white while keeping
 *  the PNG's transparency — no separate white asset is needed. */
function BannerLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logos/pizza-pazzo-logo.png"
      alt=""
      aria-hidden
      width={528}
      height={298}
      // On desktop the boards sit beside the hero, so these are above the
      // fold. `sizes` pins every instance to the same small variant, so the
      // four copies (two boards × desktop + carousel) share one request.
      sizes="160px"
      priority
      className={cn("h-auto w-full object-contain brightness-0 invert", className)}
    />
  );
}

/**
 * Shared shell: coloured board, thin inset white rule, centred type.
 * `aspect-[1/2]` keeps the portrait proportion of the 40×80 cm originals.
 */
function PromoBanner({
  tone,
  ariaLabel,
  className,
  children,
}: {
  tone: "red" | "green";
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href="/menu"
      aria-label={ariaLabel}
      className={cn(
        "group block overflow-hidden rounded-2xl shadow-card outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-pizza-ink/30 focus-visible:ring-offset-2",
        "lg:hover:-translate-y-0.5 lg:hover:shadow-soft",
        tone === "red" ? "bg-brand" : "bg-pizza-green",
        className
      )}
    >
      {/* Padding tightens below `sm` only: on a phone the two boards sit side
          by side, roughly half the width they have anywhere else. Every size
          in these boards follows the same rule — a small base value, then the
          original from `sm` up, so tablets and desktop are untouched. */}
      <div className="flex aspect-[1/2] flex-col items-center justify-between rounded-xl border border-white/45 px-2.5 py-3.5 text-center text-white sm:px-4 sm:py-5">
        {children}
      </div>
    </Link>
  );
}

/** Red board: pizza with two toppings, two sizes, collection only. */
export function TwoToppingsPromo({ className }: { className?: string }) {
  const t = useTranslations("home.promos.twoToppings");

  const size = (label: string, price: string) => (
    <div>
      <p className="text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-white/85 sm:text-xs sm:tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-0.5 font-slogan text-base leading-none sm:mt-1 sm:text-2xl">{price}</p>
    </div>
  );

  return (
    <PromoBanner tone="red" ariaLabel={t("ariaLabel")} className={className}>
      <BannerLogo className="max-w-[4.25rem] sm:max-w-[7.5rem]" />

      <h3 className="font-slogan text-[0.8rem] uppercase leading-tight tracking-wide sm:text-xl">
        {t("title")}
      </h3>

      <div className="w-full space-y-2 sm:space-y-4">
        {size(t("medium"), t("mediumPrice"))}
        <span className="mx-auto block h-px w-8 bg-white/40 sm:w-12" aria-hidden />
        {size(t("large"), t("largePrice"))}
      </div>

      <p className="rounded-full border border-white/50 px-2.5 py-1 text-[0.5rem] font-semibold uppercase tracking-[0.12em] sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.18em]">
        {t("collectionOnly")}
      </p>
    </PromoBanner>
  );
}

/** Green board: the "wrong maths" size-combination offers. */
export function PizzaMathPromo({ className }: { className?: string }) {
  const t = useTranslations("home.promos.pizzaMath");

  return (
    <PromoBanner tone="green" ariaLabel={t("ariaLabel")} className={className}>
      <h3 className="font-slogan text-[0.8rem] uppercase leading-tight tracking-wide sm:text-xl">
        {t("titleLine1")}
        <span className="block">{t("titleLine2")}</span>
      </h3>

      {/* Sized so the longest equation stays on one row in both languages —
          a wrapped equation reads as two separate offers. That is also what
          sets the phone size: the equation is the widest thing on the board. */}
      <ul className="w-full space-y-1.5 font-slogan text-[0.7rem] leading-none sm:space-y-3 sm:text-[0.95rem]">
        <li>{t("offer3030")}</li>
        <li>{t("offer4030")}</li>
        <li>{t("offer4040")}</li>
      </ul>

      <BannerLogo className="max-w-[3.75rem] sm:max-w-[6.5rem]" />

      <p className="text-[0.5rem] leading-snug text-white/90 sm:text-xs">
        {/* The explanation is a nicety; the exclusion is not. On a phone board
            there is no room for both, so only the exclusion survives. */}
        <span className="hidden sm:inline">{t("noteLine1")}</span>
        <span className="font-semibold sm:mt-1 sm:block">{t("noteLine2")}</span>
      </p>
    </PromoBanner>
  );
}

/**
 * Narrow-screen presentation: both boards side by side, always.
 *
 * They used to be a swipeable row at 78vw each, which on a phone in portrait
 * made each board taller than the screen — the pair dominated the page and the
 * second one was easy to miss. Half the row each keeps the printed 1:2
 * proportion, shows both offers at once and needs no swipe.
 *
 * The max width is what keeps a tablet sane: at 640–1024px the row would
 * otherwise stretch each board past 300px wide (and 600px tall).
 */
export function PromoBannersRow() {
  return (
    <div className="mx-auto mt-10 grid w-full max-w-[34rem] grid-cols-2 gap-3 sm:gap-4 lg:hidden">
      <TwoToppingsPromo />
      <PizzaMathPromo />
    </div>
  );
}
