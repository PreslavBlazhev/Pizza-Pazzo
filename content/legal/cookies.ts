import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Политика за бисквитки / Cookie Policy.
 *
 * The site stores only what it needs to work (strictly necessary cookies and
 * local storage — exempt from consent), has no analytics or advertising, and
 * loads the one third-party embed (the Google map on /contacts) ONLY after
 * the visitor clicks "Show the map" — that click is the separate mechanism
 * for the one non-essential item. Verified in the browser run of
 * docs/UBB-VERIFICATION.md. If analytics are ever added, a consent banner
 * must come FIRST and this document must be updated and re-versioned.
 */
export const cookiesDoc: LegalDoc = {
  slug: "cookies",
  version: LEGAL_VERSIONS.cookies,
  updated: versionDate(LEGAL_VERSIONS.cookies),
  intro: [
    {
      p: {
        bg: "Бисквитките са малки файлове, които сайтът записва в браузъра ви. Тук е описано какво записва pizzapazzo.bg и защо.",
        en: "Cookies are small files a website stores in your browser. This page describes what pizzapazzo.bg stores and why.",
      },
    },
  ],
  sections: [
    {
      id: "necessary",
      heading: { bg: "1. Строго необходими", en: "1. Strictly necessary" },
      blocks: [
        {
          list: [
            {
              bg: "pp_session (бисквитка) — поддържа входа в профила и в администрацията. Създава се само при вход, валидна до 30 дни, съдържа подписан идентификатор, не парола.",
              en: "pp_session (cookie) — keeps you signed in to your account or the admin area. Created only when you sign in, valid up to 30 days, contains a signed identifier, never a password.",
            },
            {
              bg: "NEXT_LOCALE (бисквитка) — може да бъде записана от сайта, за да запомни избрания език (BG/EN).",
              en: "NEXT_LOCALE (cookie) — may be set by the site to remember the language you chose (BG/EN).",
            },
            {
              bg: "pp-cart (локално хранилище на браузъра) — съдържанието на количката, за да не се губи при презареждане. Не се изпраща автоматично към сървъра.",
              en: "pp-cart (browser local storage) — the contents of your cart, so it survives a reload. Not sent to the server automatically.",
            },
            {
              bg: "pp-pending-payment (локално хранилище) — само при започнато плащане с карта, за да можете да се върнете към него.",
              en: "pp-pending-payment (local storage) — only while a card payment is under way, so you can get back to it.",
            },
          ],
        },
        {
          p: {
            bg: "Тези записи са нужни, за да работи сайтът, затова за тях не се иска съгласие.",
            en: "These are needed for the site to work, so no consent is asked for them.",
          },
        },
      ],
    },
    {
      id: "map",
      heading: { bg: "2. Карта на Google (само по ваш избор)", en: "2. Google map (only if you choose)" },
      blocks: [
        {
          p: {
            bg: "На страница „Контакти“ картата не се зарежда автоматично. Ако натиснете „Покажи картата“, тя се зарежда от Google, който получава IP адреса ви и може да постави свои бисквитки съгласно политиката си (policies.google.com). Ако не натиснете бутона, към Google не се изпраща нищо. Можете да отворите адреса и в Google Maps чрез връзката до него.",
            en: "On the Contacts page the map does not load automatically. If you press “Show the map”, it loads from Google, which receives your IP address and may set its own cookies under its policy (policies.google.com). If you do not press the button, nothing is sent to Google. You can also open the address in Google Maps using the link next to it.",
          },
        },
      ],
    },
    {
      id: "not-used",
      heading: { bg: "3. Какво не използваме", en: "3. What we do not use" },
      blocks: [
        {
          p: {
            bg: "Сайтът не използва аналитични, рекламни или проследяващи бисквитки. Ако в бъдеще добавим такива, първо ще поискаме съгласието ви и ще обновим тази страница.",
            en: "The site uses no analytics, advertising or tracking cookies. If we ever add any, we will ask for your consent first and update this page.",
          },
        },
      ],
    },
    {
      id: "manage",
      heading: { bg: "4. Как да ги управлявате", en: "4. Managing them" },
      blocks: [
        {
          p: {
            bg: "Можете да изтриете или блокирате бисквитките и локалното хранилище от настройките на браузъра. Изтриването на pp_session ви отписва; изтриването на локалното хранилище изпразва количката.",
            en: "You can delete or block cookies and local storage in your browser settings. Deleting pp_session signs you out; clearing local storage empties your cart.",
          },
        },
      ],
    },
  ],
};
