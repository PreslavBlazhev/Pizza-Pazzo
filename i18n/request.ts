import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Per-request i18n config. Runs on the server for every localized page and
 * supplies the message catalogue for the active locale.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // The restaurant is in Bulgaria; times shown to a visitor in London must
    // still be the restaurant's opening hours, not theirs.
    timeZone: "Europe/Sofia",
  };
});
