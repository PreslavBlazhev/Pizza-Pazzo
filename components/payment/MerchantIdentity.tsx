import { getTranslations } from "next-intl/server";
import { companyFor } from "@/content/legal/company";
import type { Locale } from "@/i18n/routing";

/**
 * The seller, with its address AND country, on every page that shows the
 * amount to pay — a card-scheme requirement repeated in UPC's "Requirements
 * for the website of the online merchants" (a link to another page is not
 * enough). The data is the Commercial Register's (content/legal/company.ts).
 */
export async function MerchantIdentity({ locale, className = "" }: { locale: Locale; className?: string }) {
  const t = await getTranslations({ locale, namespace: "payment" });
  const company = companyFor(locale);
  return (
    <p className={`text-center text-xs leading-relaxed text-pizza-muted ${className}`} data-testid="merchant-identity">
      {t("merchantLine", {
        legalName: company.legalName,
        uic: company.uic,
        address: company.registeredAddress.replace(/,?\s*Bulgaria$/, ""),
      })}
    </p>
  );
}
