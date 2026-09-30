import type { CardBrandMark } from "@/lib/payments/card-marks";

/**
 * The approved card-acceptance marks, at their own proportions (fixed height,
 * natural width — never stretched or recoloured). Renders nothing for an
 * empty list, which is the case until card payment is really live
 * (lib/payments/card-marks.ts).
 */
export function CardBrandMarks({
  marks,
  label,
  className = "",
}: {
  marks: CardBrandMark[];
  /** e.g. "Приемаме плащане с карти" — the list's accessible name. */
  label: string;
  className?: string;
}) {
  if (marks.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <span className="text-xs text-pizza-muted">{label}</span>
      <ul aria-label={label} className="flex flex-wrap items-center gap-3">
        {marks.map((m) => (
          <li key={m.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- official artwork, shown untouched */}
            <img src={m.src} alt={m.label} className="h-7 w-auto" />
          </li>
        ))}
      </ul>
    </div>
  );
}
