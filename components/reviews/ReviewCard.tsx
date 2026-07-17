import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { sourceLabel, type Review } from "./reviews-data";

export function Stars({ rating }: { rating: number }) {
  const t = useTranslations("reviews");

  return (
    <div className="flex gap-0.5 text-brand" aria-label={t("rating", { rating })}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden className={i < rating ? "" : "opacity-25"}>
          ★
        </span>
      ))}
    </div>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <Card className="flex h-full flex-col rounded-3xl">
      <Stars rating={review.rating} />
      <p className="mt-3 flex-1 text-sm leading-relaxed text-pizza-ink/80">
        “{review.text}”
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-pizza-cream-dark pt-3">
        <span className="text-sm font-semibold text-pizza-ink">
          {review.author}
        </span>
        <span className="text-xs text-pizza-muted">
          {sourceLabel[review.source]}
        </span>
      </div>
    </Card>
  );
}
