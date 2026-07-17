import reviewsJson from "@/data/reviews.json";

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  source: "google" | "facebook";
  date: string;
}

export const reviews = reviewsJson as Review[];

export const sourceLabel: Record<Review["source"], string> = {
  google: "Google",
  facebook: "Facebook",
};

export function averageRating(list: Review[] = reviews) {
  if (list.length === 0) return 0;
  return list.reduce((s, r) => s + r.rating, 0) / list.length;
}
