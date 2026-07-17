import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { averageRating, reviews } from "@/components/reviews/reviews-data";

export const metadata: Metadata = {
  title: "Отзиви",
  description:
    "Какво казват гостите на Pizza Pazzo — отзиви от Google и Facebook.",
};

export default function ReviewsPage() {
  const avg = averageRating();

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Мнения на гостите"
          title="Какво казват клиентите"
          subtitle={
            reviews.length > 0
              ? `Средна оценка ${avg.toFixed(1)} от 5 в Google и Facebook.`
              : undefined
          }
          note="* Примерни отзиви — ще бъдат заменени с реални от Google и Facebook."
        />

        <div className="container pb-24 pt-12">
          {reviews.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-pizza-muted">
              Все още няма публикувани отзиви.
            </p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/contacts"
              className="inline-block rounded-full border border-pizza-green px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
            >
              Свържете се с нас
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
