import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Photographic garnish around the two promo boards: herbs on the left, tomatoes
 * on the right. Purely decorative — the boards themselves are opaque, so the
 * only parts that read are the leaves and fruit spilling past their edges.
 *
 * Placement rules that matter:
 *  - The layer sits at `-z-10` inside the hero's `isolate` stacking context, so
 *    it paints above the page's doodle background but under the boards and the
 *    central column. Without the isolation an absolutely positioned sibling
 *    would paint *over* the static container instead.
 *  - `pointer-events-none` keeps the board links clickable through the artwork.
 *  - Desktop only. Below `lg` the boards move into a carousel and there is no
 *    room left to garnish, so the images are never requested at all.
 */

interface DecorProps {
  src: string;
  /** Rendered widths, for the responsive srcset. */
  sizes: string;
  className: string;
}

function Decor({ src, sizes, className }: DecorProps) {
  return (
    <div className={cn("absolute hidden lg:block", className)}>
      {/* `fill` + `object-contain` means the artwork is never stretched and we
          need no intrinsic dimensions — any cutout proportion drops in cleanly.
          Deliberately not `priority`: the hero logo is the LCP element and
          should keep the preload slot to itself. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        quality={80}
        className="select-none object-contain"
      />
    </div>
  );
}

export function HeroDecorations() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none">
      {/* Herbs — basil, lovage, parsley — sweeping in from the left edge and
          tucking behind the red board. Sat a little below centre so the mass
          gathers at the foot of the board rather than level with it. */}
      <Decor
        src="/images/decor/herbs-left.webp"
        sizes="(min-width: 1536px) 360px, (min-width: 1280px) 300px, 220px"
        className={cn(
          "top-[56%] -translate-y-1/2",
          "-left-20 h-[420px] w-[220px]",
          "xl:-left-14 xl:h-[500px] xl:w-[300px]",
          "2xl:-left-20 2xl:h-[560px] 2xl:w-[360px]"
        )}
      />

      {/* Tomatoes — whole and cut, with a few leaves — entering from the right
          and running off the viewport, which is what keeps it from looking
          like a symmetrical mirror of the herbs. */}
      <Decor
        src="/images/decor/tomatoes-right.webp"
        sizes="(min-width: 1536px) 380px, (min-width: 1280px) 320px, 240px"
        className={cn(
          "top-[58%] -translate-y-1/2",
          "-right-24 h-[420px] w-[240px]",
          "xl:-right-16 xl:h-[500px] xl:w-[320px]",
          "2xl:-right-24 2xl:h-[560px] 2xl:w-[380px]"
        )}
      />
    </div>
  );
}
