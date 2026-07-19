import type { LegalDoc } from "./types";

/**
 * Политика за бисквитки / Cookie Policy — DRAFT for client review.
 *
 * Deliberately honest about the actual footprint: ONLY strictly necessary /
 * functional storage (session cookie, language cookie, cart in localStorage),
 * no analytics, no marketing — which is exactly why the site shows NO cookie
 * consent banner (essential cookies are exempt from consent under the
 * ePrivacy rules). If analytics are ever added, a consent banner must be
 * added FIRST and this document updated.
 */
export const cookiesDoc: LegalDoc = {
  slug: "cookies",
  updated: "18.07.2026",
  intro: [
    {
      p: {
        bg: "Бисквитките са малки текстови файлове, които сайтът записва в браузъра ви. Тази страница описва какво използва www.pizzapazzo.bg и защо.",
        en: "Cookies are small text files a site stores in your browser. This page describes what www.pizzapazzo.bg uses and why.",
      },
    },
  ],
  sections: [
    {
      heading: { bg: "1. Какво използваме", en: "1. What we use" },
      blocks: [
        {
          list: [
            {
              bg: "pp_session — бисквитка за вход (сесия). Строго необходима: без нея не може да ползвате профил и админ панел. Валидност: до 30 дни. Не съдържа парола, а подписан билет.",
              en: "pp_session — sign-in (session) cookie. Strictly necessary: without it accounts and the admin panel cannot work. Lifetime: up to 30 days. It contains a signed token, never your password.",
            },
            {
              bg: "NEXT_LOCALE — функционална бисквитка, запомняща избрания от вас език (BG/EN), когато превключите ръчно.",
              en: "NEXT_LOCALE — functional cookie remembering the language (BG/EN) you selected manually.",
            },
            {
              bg: "Количка (pp-cart) — съхранява се в localStorage на браузъра ви (не е бисквитка и не се изпраща към сървъра), за да не губите избраните продукти при презареждане.",
              en: "Cart (pp-cart) — stored in your browser's localStorage (not a cookie; never sent to the server), so your selected products survive a page reload.",
            },
          ],
        },
      ],
    },
    {
      heading: { bg: "2. Какво НЕ използваме", en: "2. What we do NOT use" },
      blocks: [
        {
          p: {
            bg: "Сайтът не използва аналитични, рекламни или проследяващи бисквитки и не споделя данни от бисквитки с трети страни. Затова не показваме банер за съгласие — строго необходимите бисквитки са освободени от изискването за съгласие. Ако в бъдеще добавим аналитични инструменти, първо ще поискаме съгласието ви и ще актуализираме тази страница.",
            en: "The site uses no analytics, advertising or tracking cookies and shares no cookie data with third parties. That is why we show no consent banner — strictly necessary cookies are exempt from the consent requirement. If we ever add analytics, we will ask for your consent first and update this page.",
          },
        },
      ],
    },
    {
      heading: { bg: "3. Как да управлявате бисквитките", en: "3. Managing cookies" },
      blocks: [
        {
          p: {
            bg: "Можете да изтривате или блокирате бисквитки от настройките на браузъра си. Ако изтриете pp_session, ще бъдете отписани от профила си; изтриването на локалното хранилище изпразва количката.",
            en: "You can delete or block cookies from your browser settings. Deleting pp_session signs you out of your account; clearing local storage empties your cart.",
          },
        },
      ],
    },
    {
      heading: { bg: "4. Промени", en: "4. Changes" },
      blocks: [
        {
          p: {
            bg: "При промяна в използваните бисквитки ще актуализираме тази страница и датата в началото ѝ.",
            en: "If the cookies we use change, we will update this page and the date at its top.",
          },
        },
      ],
    },
  ],
};
