import Link from "next/link";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { averageRating, reviews } from "@/components/reviews/reviews-data";

/** Homepage teaser for customer reviews. Full list lives on /reviews. */
export function ReviewsSection() {
  if (reviews.length === 0) return null;

  return (
    <section className="py-16 sm:py-20">
      <div className="container">
        <SectionHeading
          center
          eyebrow="Мнения на гостите"
          title="Какво казват клиентите"
          subtitle={`Средна оценка ${averageRating().toFixed(1)} от 5 в Google и Facebook.`}
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {reviews.slice(0, 4).map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/reviews"
            className="inline-block rounded-full border border-pizza-ink/15 px-8 py-3 font-semibold text-pizza-ink transition hover:border-brand hover:text-brand"
          >
            Виж всички отзиви
          </Link>
        </div>
      </div>
    </section>
  );
}
