import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { companyFor } from "@/content/legal/company";
import {
  getRestaurantSettings,
  settingsAddress,
  settingsPhones,
} from "@/lib/restaurant-settings";
import { groupWorkingHours, telHref, workingHoursRowLabel } from "@/lib/working-hours";
import { DELIVERY_AREA, deliveryTownsLabel } from "@/lib/delivery-area";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import {
  pickL,
  type LegalBlock,
  type LegalDoc,
  type LegalDynamicBlock,
} from "@/content/legal/types";
import type { RestaurantSettingsData, Weekday } from "@/types/settings";
import type { Locale } from "@/i18n/routing";

/**
 * Renders one legal document for a locale. Layout only — the prose lives in
 * `content/legal/*.ts`; the facts that live in configuration (merchant,
 * contacts, hours, delivery area, active payment methods) are rendered here
 * from the same sources the footer and checkout use, so the documents never
 * contradict the rest of the site.
 */
export async function LegalArticle({ doc, locale }: { doc: LegalDoc; locale: Locale }) {
  const t = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const settings = await getRestaurantSettings();

  const renderBlock = (block: LegalBlock, key: number) => {
    if ("p" in block) {
      return (
        <p key={key} className="mt-3 text-sm leading-relaxed text-pizza-muted sm:text-base">
          {pickL(block.p, locale)}
        </p>
      );
    }
    if ("list" in block) {
      return (
        <ul
          key={key}
          className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-pizza-muted sm:text-base"
        >
          {block.list.map((item, i) => (
            <li key={i}>{pickL(item, locale)}</li>
          ))}
        </ul>
      );
    }
    return <DynamicBlock key={key} kind={block.dynamic} locale={locale} settings={settings} />;
  };

  const tocSections = doc.sections.filter((s) => s.id);

  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-xs text-pizza-muted">
        {t("updated", { date: doc.updated })} · {t("version", { version: doc.version })}
      </p>

      {doc.showCompanyBox && (
        <div className="mt-5 rounded-2xl border border-pizza-cream-dark bg-pizza-cream/40 p-5 text-sm text-pizza-ink">
          <MerchantDetails locale={locale} settings={settings} />
        </div>
      )}

      {tocSections.length > 3 && (
        <nav
          aria-label={t("toc")}
          className="mt-6 rounded-2xl border border-pizza-cream-dark bg-white p-5"
        >
          <p className="text-sm font-semibold text-pizza-ink">{t("toc")}</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {tocSections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-pizza-muted underline-offset-2 transition hover:text-brand hover:underline"
                >
                  {pickL(s.heading, locale)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {doc.intro?.map(renderBlock)}

      {doc.sections.map((section, i) => (
        <section key={i} id={section.id} className="mt-8 scroll-mt-28">
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

/** The merchant identity — name, registry data, addresses and contacts. */
async function MerchantDetails({
  locale,
  settings,
}: {
  locale: Locale;
  settings: RestaurantSettingsData;
}) {
  const t = await getTranslations("legal");
  const company = companyFor(locale);
  const phones = settingsPhones(settings);

  return (
    <>
      <p className="font-semibold">{company.legalName}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-pizza-muted sm:grid-cols-[auto_1fr]">
        <dt className="font-medium text-pizza-ink">{t("uic")}</dt>
        <dd>{company.uic}</dd>
        <dt className="font-medium text-pizza-ink">{t("vatNumber")}</dt>
        <dd>{company.vatNumber}</dd>
        <dt className="font-medium text-pizza-ink">{t("registeredAddress")}</dt>
        <dd>{company.registeredAddress}</dd>
        <dt className="font-medium text-pizza-ink">{t("correspondenceAddress")}</dt>
        <dd>{company.correspondenceAddress}</dd>
        <dt className="font-medium text-pizza-ink">{t("restaurantAddress")}</dt>
        <dd>{settingsAddress(settings, locale)}</dd>
        <dt className="font-medium text-pizza-ink">{t("phoneLabel")}</dt>
        <dd className="flex flex-wrap gap-x-3">
          {phones.map((p) => (
            <a key={p} href={telHref(p)} className="underline transition hover:text-brand">
              {p}
            </a>
          ))}
        </dd>
        <dt className="font-medium text-pizza-ink">{t("emailLabel")}</dt>
        <dd>
          <a
            href={`mailto:${settings.contactEmail}`}
            className="break-all underline transition hover:text-brand"
          >
            {settings.contactEmail}
          </a>
        </dd>
        {company.foodRegistration && (
          <>
            <dt className="font-medium text-pizza-ink">{t("foodRegistration")}</dt>
            <dd>
              {t("foodRegistrationValue", {
                number: company.foodRegistration.number,
                certificate: company.foodRegistration.certificate,
                authority: company.foodRegistration.authority,
              })}
            </dd>
          </>
        )}
        <dt className="font-medium text-pizza-ink">{t("consumerAuthority")}</dt>
        <dd>
          <a
            href="https://kzp.bg"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition hover:text-brand"
          >
            {t("consumerAuthorityName")}
          </a>
        </dd>
      </dl>
    </>
  );
}

/** One live fact inside a document. */
async function DynamicBlock({
  kind,
  locale,
  settings,
}: {
  kind: LegalDynamicBlock;
  locale: Locale;
  settings: RestaurantSettingsData;
}) {
  const t = await getTranslations("legal");
  const tHours = await getTranslations("hours");
  const box = "mt-3 rounded-2xl border border-pizza-cream-dark bg-pizza-cream/30 p-4 text-sm text-pizza-ink sm:text-base";

  switch (kind) {
    case "merchant":
      return (
        <div className={box}>
          <MerchantDetails locale={locale} settings={settings} />
        </div>
      );

    case "contactChannels": {
      const phones = settingsPhones(settings);
      return (
        <ul className={`${box} space-y-1`}>
          <li>
            {t("phoneLabel")}:{" "}
            {phones.map((p, i) => (
              <span key={p}>
                {i > 0 && ", "}
                <a href={telHref(p)} className="font-medium underline transition hover:text-brand">
                  {p}
                </a>
              </span>
            ))}
          </li>
          <li>
            {t("emailLabel")}:{" "}
            <a
              href={`mailto:${settings.contactEmail}`}
              className="break-all font-medium underline transition hover:text-brand"
            >
              {settings.contactEmail}
            </a>
          </li>
          <li>
            {t("correspondenceAddress")}: {companyFor(locale).correspondenceAddress}
          </li>
        </ul>
      );
    }

    case "workingHours": {
      const rows = groupWorkingHours(settings.hours);
      const dayName = (day: Weekday) => tHours(day);
      return (
        <div className={box}>
          <p className="font-semibold">{tHours("title")}</p>
          <ul className="mt-1 space-y-0.5">
            {rows.map((row) => (
              <li key={row.days[0]}>
                {workingHoursRowLabel(row, dayName)}:{" "}
                <span className="font-medium">
                  {row.closed ? tHours("closed") : row.allDay ? tHours("allDay") : row.hours}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "deliveryArea": {
      const lines = [
        t("areaTowns", { towns: deliveryTownsLabel(locale) }),
        DELIVERY_AREA.feeEur === 0 ? t("areaFree") : null,
        DELIVERY_AREA.minimumOrderEur === null ? t("areaNoMinimum") : null,
        DELIVERY_AREA.pickupAvailable ? null : t("areaNoPickup"),
      ].filter((line): line is string => Boolean(line));
      return (
        <ul className={`${box} list-disc space-y-1 pl-8`}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      );
    }

    case "paymentMethods": {
      // The REAL provider only — the staff-only demo is not a payment method
      // offered to customers and is never described as one.
      const cardLive = getEffectivePaymentConfig().enabled && !getEffectivePaymentConfig().isTest;
      return (
        <ul className={`${box} space-y-2`}>
          <li>
            <span className="font-semibold">{t("payCash")}</span> — {t("payActive")}.{" "}
            {t("payCashText")}
          </li>
          <li>
            <span className="font-semibold">{t("payCard")}</span> —{" "}
            {cardLive ? `${t("payActive")}. ${t("payCardActiveText")}` : t("payCardInactiveText")}
          </li>
        </ul>
      );
    }

    case "withdrawalForm": {
      const company = companyFor(locale);
      return (
        <div className={`${box} space-y-2`}>
          <p className="font-semibold">{t("formTitle")}</p>
          <p className="text-xs text-pizza-muted">{t("formHint")}</p>
          <p>
            {t("formTo")}: {company.legalName}, {company.correspondenceAddress},{" "}
            {settings.contactEmail}
          </p>
          <p>{t("formBody")}</p>
          <p>{t("formOrdered")}</p>
          <p>{t("formName")}</p>
          <p>{t("formAddress")}</p>
          <p>{t("formSignature")}</p>
          <p>{t("formDate")}</p>
          <p className="text-xs text-pizza-muted">{t("formStrike")}</p>
        </div>
      );
    }
  }
}
