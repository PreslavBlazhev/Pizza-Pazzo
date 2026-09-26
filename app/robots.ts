import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { getAppEnv } from "@/lib/app-env";

export default function robots(): MetadataRoute.Robots {
  // A staging or development copy must never be indexed next to the real
  // site — it would compete with it and could send people to a test shop.
  if (getAppEnv() !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or session-bound areas. They are already gated by middleware and
      // marked noindex; keeping crawlers out of them saves the crawl budget for
      // the menu, which is what the restaurant actually wants ranked.
      disallow: [
        "/admin",
        "/en/admin",
        "/profile",
        "/en/profile",
        "/checkout",
        "/en/checkout",
        "/payment",
        "/en/payment",
        "/auth/",
        "/en/auth/",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
