import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  const t = useTranslations("logo");
  const img = (
    <Image
      src="/logos/pizza-pazzo-logo.png"
      alt="Pizza Pazzo"
      width={528}
      height={298}
      priority={priority}
      className={cn("w-auto select-none", className)}
    />
  );

  if (!linked) return img;
  return (
    <Link href="/" aria-label={t("home")} className="inline-flex">
      {img}
    </Link>
  );
}
