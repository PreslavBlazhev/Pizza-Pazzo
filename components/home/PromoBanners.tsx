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
      <div className="flex aspect-[1/2] flex-col items-center justify-between rounded-xl border border-white/45 px-4 py-5 text-center text-white">
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
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/85 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 font-slogan text-xl leading-none sm:text-2xl">{price}</p>
    </div>
  );

  return (
    <PromoBanner tone="red" ariaLabel={t("ariaLabel")} className={className}>
      <BannerLogo className="max-w-[7.5rem]" />

      <h3 className="font-slogan text-lg uppercase leading-tight tracking-wide sm:text-xl">
        {t("title")}
      </h3>

      <div className="w-full space-y-4">
        {size(t("medium"), t("mediumPrice"))}
        <span className="mx-auto block h-px w-12 bg-white/40" aria-hidden />
        {size(t("large"), t("largePrice"))}
      </div>

      <p className="rounded-full border border-white/50 px-4 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] sm:text-xs">
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
      <h3 className="font-slogan text-lg uppercase leading-tight tracking-wide sm:text-xl">
        {t("titleLine1")}
        <span className="block">{t("titleLine2")}</span>
      </h3>

      {/* Sized so the longest equation stays on one row in both languages —
          a wrapped equation reads as two separate offers. */}
      <ul className="w-full space-y-3 font-slogan text-[0.95rem] leading-none">
        <li>{t("offer3030")}</li>
        <li>{t("offer4030")}</li>
        <li>{t("offer4040")}</li>
      </ul>

      <BannerLogo className="max-w-[6.5rem]" />

      <p className="text-[0.7rem] leading-snug text-white/90 sm:text-xs">
        {t("noteLine1")}
        <span className="mt-1 block font-semibold">{t("noteLine2")}</span>
      </p>
    </PromoBanner>
  );
}

/**
 * Narrow-screen presentation: a swipeable, snapping row. The second board is
 * deliberately part-visible at the right edge so the swipe is discoverable.
 * No autoplay, no carousel library — just scroll snapping.
 */
export function PromoBannersCarousel() {
  return (
    <div
      className={cn(
        "-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:hidden",
        // `safe center` centres the pair on a tablet where both fit, but falls
        // back to start alignment when they overflow — plain `justify-center`
        // would push the first board out of reach on a phone.
        "[justify-content:safe_center]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      )}
    >
      <TwoToppingsPromo className="w-[78vw] max-w-[17rem] shrink-0 snap-center sm:w-[46vw]" />
      <PizzaMathPromo className="w-[78vw] max-w-[17rem] shrink-0 snap-center sm:w-[46vw]" />
    </div>
  );
}
