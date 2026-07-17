import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Tailwind height class, e.g. "h-11". Width scales automatically. */
  className?: string;
  /** Wrap in a link to the homepage (default true). */
  linked?: boolean;
  priority?: boolean;
}

/**
 * Pizza Pazzo logo (transparent PNG produced from the client's artwork).
 * The image is the single source of truth — swap the file to rebrand.
 */
export function Logo({ className = "h-11", linked = true, priority }: LogoProps) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/pizza-pazzo-logo.png"
      alt="Pizza Pazzo"
      width={528}
      height={298}
      loading={priority ? "eager" : "lazy"}
      className={cn("w-auto select-none", className)}
    />
  );

  if (!linked) return img;
  return (
    <Link href="/" aria-label="Pizza Pazzo — начало" className="inline-flex">
      {img}
    </Link>
  );
}
