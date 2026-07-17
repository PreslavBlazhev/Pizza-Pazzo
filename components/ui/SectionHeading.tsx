import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
  className?: string;
}

/** Decorative divider: green rule — diamond — green rule. */
function Ornament({ center }: { center?: boolean }) {
  return (
    <div className={cn("mt-4 flex items-center gap-2", center && "justify-center")}>
      <span className="h-px w-10 bg-pizza-green/40" />
      <span className="text-xs text-pizza-green">◆</span>
      <span className="h-px w-10 bg-pizza-green/40" />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn(center && "text-center", className)}>
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-2 text-3xl font-bold text-pizza-ink sm:text-4xl">
        {title}
      </h2>
      <Ornament center={center} />
      {subtitle && (
        <p
          className={cn(
            "mt-4 text-pizza-muted",
            center && "mx-auto max-w-2xl"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
