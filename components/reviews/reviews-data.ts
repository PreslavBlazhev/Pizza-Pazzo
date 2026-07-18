import reviewsJson from "@/data/reviews.json";

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  source: "google" | "facebook";
  date: string;
}

/**
 * PRODUCTION SAFETY GATE. The entries in data/reviews.json are INVENTED
 * sample reviews labelled as coming from Google/Facebook — publishing them
 * as real would violate consumer-protection law and Google's policies.
 * While this is false, the public pages render their honest empty states
 * (the homepage section disappears, /reviews says none are published yet).
 * Flip to true ONLY after data/reviews.json holds real customer reviews.
 * See docs/client-reviews-needed.md.
 */
export const REVIEWS_ENABLED = false;

export const reviews: Review[] = REVIEWS_ENABLED ? (reviewsJson as Review[]) : [];

export const sourceLabel: Record<Review["source"], string> = {
  google: "Google",
  facebook: "Facebook",
};

export function averageRating(list: Review[] = reviews) {
  if (list.length === 0) return 0;
  return list.reduce((s, r) => s + r.rating, 0) / list.length;
}
