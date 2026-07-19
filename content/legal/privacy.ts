import type { LegalDoc } from "./types";

/**
 * Политика за поверителност / Privacy Policy — DRAFT for client + lawyer
 * review. Describes what the system ACTUALLY does today: order + account
 * data in our own database (SQLite on the hosting provider's disk), emails
 * via Resend, no analytics, no marketing, no data sales.
 */
export const privacyDoc: LegalDoc = {
  slug: "privacy",
  updated: "18.07.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази политика обяснява какви лични данни събираме чрез сайта www.pizzapazzo.bg, защо ги събираме, на кого може да ги предоставим и какви права имате. Администратор на данните е Pizza Pazzo LTD (данните за контакт са по-долу).",
        en: "This policy explains what personal data we collect through www.pizzapazzo.bg, why we collect it, who it may be shared with, and what rights you have. The data controller is Pizza Pazzo LTD (contact details below).",
      },
    },
  ],
  sections: [
    {
      heading: { bg: "1. Какви данни събираме", en: "1. What data we collect" },
      blocks: [
        {
          list: [
            {
              bg: "При поръчка: име, телефон, имейл, адрес за доставка, съдържание на поръчката и бележки към нея.",
              en: "When you order: name, phone number, email, delivery address, the contents of the order and any notes.",
            },
            {
              bg: "При регистрация: име, имейл, телефон, парола (съхранявана само като необратим хеш) и запазените от вас адреси.",
              en: "When you register: name, email, phone, password (stored only as an irreversible hash) and your saved addresses.",
            },
            {
              bg: "Технически данни: сървърни логове (IP адрес, час на заявката) за кратък период, за целите на сигурността и отстраняването на проблеми.",
              en: "Technical data: server logs (IP address, request time) kept briefly for security and troubleshooting.",
            },
          ],
        },
        {
          p: {
            bg: "Не събираме специални категории данни и не използваме данните ви за автоматизирано профилиране.",
            en: "We do not collect special categories of data and we do not use your data for automated profiling.",
          },
        },
      ],
    },
    {
      heading: { bg: "2. Защо и на какво основание", en: "2. Purposes and legal bases" },
      blocks: [
        {
          list: [
            {
              bg: "Изпълнение на поръчката ви (договор — чл. 6, § 1, б. „б“ ОРЗД): контакт, приготвяне, доставка, уведомления за статуса.",
              en: "Fulfilling your order (contract — Art. 6(1)(b) GDPR): contact, preparation, delivery, status notifications.",
            },
            {
              bg: "Поддържане на профила ви (договор): вход, запазени адреси, история на поръчките.",
              en: "Maintaining your account (contract): sign-in, saved addresses, order history.",
            },
            {
              bg: "Сигурност на сайта и предотвратяване на злоупотреби (легитимен интерес — чл. 6, § 1, б. „е“).",
              en: "Site security and abuse prevention (legitimate interest — Art. 6(1)(f)).",
            },
            {
              bg: "Счетоводна и данъчна отчетност (законово задължение — чл. 6, § 1, б. „в“).",
              en: "Accounting and tax reporting (legal obligation — Art. 6(1)(c)).",
            },
          ],
        },
        {
          p: {
            bg: "Не изпращаме маркетингови съобщения и не продаваме данни на трети лица.",
            en: "We do not send marketing messages and we do not sell data to third parties.",
          },
        },
      ],
    },
    {
      heading: { bg: "3. Кой има достъп до данните", en: "3. Who has access to the data" },
      blocks: [
        {
          list: [
            {
              bg: "Персоналът на ресторанта — само доколкото е нужно за изпълнение на поръчките (ролеви достъп).",
              en: "Restaurant staff — only to the extent needed to fulfil orders (role-based access).",
            },
            {
              bg: "Доставчикът на хостинг (Render) — базата данни се съхранява на негова инфраструктура.",
              en: "Our hosting provider (Render) — the database is stored on its infrastructure.",
            },
            {
              bg: "Доставчикът на имейл услуга (Resend) — за изпращане на потвърждения и известия за поръчки.",
              en: "Our email delivery provider (Resend) — for sending order confirmations and notifications.",
            },
            {
              bg: "Счетоводители и държавни органи — когато закон го изисква.",
              en: "Accountants and public authorities — where required by law.",
            },
          ],
        },
        {
          p: {
            bg: "Ако обработката налага пренос на данни извън ЕИП (напр. инфраструктура на доставчик в САЩ), той се извършва при гаранциите на чл. 46 ОРЗД (стандартни договорни клаузи).",
            en: "If processing involves transfers outside the EEA (e.g. a provider's US infrastructure), it is carried out under the safeguards of Art. 46 GDPR (standard contractual clauses).",
          },
        },
      ],
    },
    {
      heading: { bg: "4. Колко време съхраняваме данните", en: "4. How long we keep the data" },
      blocks: [
        {
          list: [
            {
              bg: "Данни за поръчки: за срока, изискван от данъчното и счетоводното законодателство.",
              en: "Order data: for the period required by tax and accounting legislation.",
            },
            {
              bg: "Профил: докато не поискате изтриването му. При изтриване поръчките се анонимизират в частта, която законът позволява.",
              en: "Account: until you request its deletion. Upon deletion, orders are anonymised to the extent the law allows.",
            },
            {
              bg: "Сървърни логове: кратък технически срок.",
              en: "Server logs: a short technical period.",
            },
          ],
        },
      ],
    },
    {
      heading: { bg: "5. Вашите права", en: "5. Your rights" },
      blocks: [
        {
          p: {
            bg: "Имате право на достъп до данните си, коригиране, изтриване, ограничаване на обработката, преносимост и възражение. За да упражните право, пишете ни на имейла по-долу — ще отговорим в срок до един месец.",
            en: "You have the right to access your data, to rectification, erasure, restriction of processing, portability and objection. To exercise a right, email us at the address below — we will respond within one month.",
          },
        },
        {
          p: {
            bg: "Ако смятате, че правата ви са нарушени, можете да подадете жалба до Комисията за защита на личните данни (КЗЛД): www.cpdp.bg, гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2.",
            en: "If you believe your rights have been infringed, you may lodge a complaint with the Bulgarian Commission for Personal Data Protection (CPDP): www.cpdp.bg, 2 Prof. Tsvetan Lazarov Blvd., 1592 Sofia.",
          },
        },
      ],
    },
    {
      heading: { bg: "6. Сигурност", en: "6. Security" },
      blocks: [
        {
          p: {
            bg: "Паролите се съхраняват само като хеш (bcrypt). Сесиите използват подписани httpOnly бисквитки. Достъпът до административния панел е ограничен по роли, а връзката със сайта е криптирана (HTTPS).",
            en: "Passwords are stored only as a hash (bcrypt). Sessions use signed httpOnly cookies. Access to the admin panel is role-restricted, and the connection to the site is encrypted (HTTPS).",
          },
        },
      ],
    },
    {
      heading: { bg: "7. Деца", en: "7. Children" },
      blocks: [
        {
          p: {
            bg: "Сайтът не е предназначен за създаване на профили от лица под 16 години без съгласието на родител/настойник.",
            en: "The site is not intended for account creation by persons under 16 without parental/guardian consent.",
          },
        },
      ],
    },
    {
      heading: { bg: "8. Бисквитки", en: "8. Cookies" },
      blocks: [
        {
          p: {
            bg: "Сайтът използва само технически необходими бисквитки. Подробности — в Политиката за бисквитки.",
            en: "The site uses only strictly necessary cookies. Details are in the Cookie Policy.",
          },
        },
      ],
    },
    {
      heading: { bg: "9. Промени", en: "9. Changes" },
      blocks: [
        {
          p: {
            bg: "При съществена промяна на тази политика ще актуализираме датата в началото ѝ, а когато е уместно — ще ви уведомим по имейл.",
            en: "If this policy changes materially we will update the date at the top and, where appropriate, notify you by email.",
          },
        },
      ],
    },
  ],
};
