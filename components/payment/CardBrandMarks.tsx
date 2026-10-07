import type { CardBrandMark } from "@/lib/payments/card-marks";

/**
 * The approved card-acceptance marks, at their own proportions (fixed height,
 * natural width — never stretched or recoloured). Renders nothing for an
 * empty list (lib/payments/card-marks.ts decides what is shown where).
 */
export function CardBrandMarks({
  marks,
  label,
  note,
  className = "",
}: {
  marks: CardBrandMark[];
  /** e.g. "Приемаме плащане с карти" — the list's accessible name. */
  label: string;
  /** A line under the marks (e.g. that card payment is not active yet). */
  note?: React.ReactNode;
  className?: string;
}) {
  if (marks.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
      <span className="text-xs text-pizza-muted">{label}</span>
      {/* gap-4: clear space between marks, each on the footer's plain white. */}
      <ul aria-label={label} className="flex flex-wrap items-center gap-4">
        {marks.map((m) => (
          <li key={m.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- official artwork, shown untouched */}
            <img src={m.src} alt={m.label} className="h-7 w-auto" />
          </li>
        ))}
      </ul>
      {note && <p className="w-full text-center text-xs text-pizza-muted">{note}</p>}
    </div>
  );
}
