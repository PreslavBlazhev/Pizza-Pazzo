import type { routing } from "@/i18n/routing";
import type messages from "./messages/bg.json";

/**
 * Makes translation keys type-safe.
 *
 * `t("home.hero.badgee")` becomes a compile error instead of a live page
 * rendering the raw key. Bulgarian is the reference catalogue, so a key added
 * to bg.json but forgotten in en.json is caught by `npm run check:i18n`.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
