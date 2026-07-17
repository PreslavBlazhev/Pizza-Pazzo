import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or session-bound areas. They are already gated by middleware and
      // marked noindex; keeping crawlers out of them saves the crawl budget for
      // the menu, which is what the restaurant actually wants ranked.
      disallow: ["/admin", "/en/admin", "/profile", "/en/profile", "/checkout", "/en/checkout", "/auth/", "/en/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
