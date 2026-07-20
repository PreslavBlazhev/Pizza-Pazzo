import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/content/legal/company";
import { pickL, type LegalBlock, type LegalDoc } from "@/content/legal/types";
import type { Locale } from "@/i18n/routing";

/**
 * Renders one legal document (terms / privacy / cookies / delivery) for a
 * locale. Layout only — every word of content lives in `content/legal/*.ts`.
 */
export function LegalArticle({ doc, locale }: { doc: LegalDoc; locale: Locale }) {
  const t = useTranslations("legal");
  const tCommon = useTranslations("common");

  const renderBlock = (block: LegalBlock, key: number) =>
    "p" in block ? (
      <p key={key} className="mt-3 text-sm leading-relaxed text-pizza-muted sm:text-base">
        {pickL(block.p, locale)}
      </p>
    ) : (
      <ul key={key} className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-pizza-muted sm:text-base">
        {block.list.map((item, i) => (
          <li key={i}>{pickL(item, locale)}</li>
        ))}
      </ul>
    );

  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-xs text-pizza-muted">{t("updated", { date: doc.updated })}</p>

      {doc.showCompanyBox && (
        <div className="mt-5 rounded-2xl border border-pizza-cream-dark bg-pizza-cream/40 p-5 text-sm text-pizza-ink">
          <p className="font-semibold">{COMPANY.legalName}</p>
          <ul className="mt-2 space-y-1 text-pizza-muted">
            {COMPANY.uic && (
              <li>
                {t("uic")}: {COMPANY.uic}
              </li>
            )}
            {COMPANY.vatNumber && (
              <li>
                {t("vatNumber")}: {COMPANY.vatNumber}
              </li>
            )}
            <li>
              {t("addressLabel")}: {COMPANY.address}
              {COMPANY.city ? `, ${COMPANY.city}` : ""}
            </li>
            {COMPANY.registeredAddress && (
              <li>
                {t("registeredAddress")}: {COMPANY.registeredAddress}
              </li>
            )}
            {COMPANY.managerName && (
              <li>
                {t("managerName")}: {COMPANY.managerName}
              </li>
            )}
            <li>
              {t("emailLabel")}:{" "}
              <a href={`mailto:${COMPANY.email}`} className="underline transition hover:text-brand">
                {COMPANY.email}
              </a>
            </li>
            <li>
              {t("phoneLabel")}:{" "}
              <a
                href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
                className="underline transition hover:text-brand"
              >
                {COMPANY.phone}
              </a>
            </li>
          </ul>
        </div>
      )}

      {doc.intro?.map(renderBlock)}

      {doc.sections.map((section, i) => (
        <section key={i} className="mt-8">
          <h2 className="font-display text-lg font-semibold text-pizza-ink sm:text-xl">
            {pickL(section.heading, locale)}
          </h2>
          {section.blocks.map(renderBlock)}
        </section>
      ))}

      <div className="mt-12 border-t border-pizza-cream-dark pt-8 text-center">
        <Link
          href="/menu"
          className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          ← {tCommon("toMenu")}
        </Link>
      </div>
    </article>
  );
}
