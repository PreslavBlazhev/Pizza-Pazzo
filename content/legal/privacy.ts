import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Политика за поверителност / Privacy Policy (website).
 *
 * Describes what the system ACTUALLY does, checked in code on 2026-09-29:
 *   - orders, accounts and the checkout confirmations live in our own SQLite
 *     database on the hosting provider (Render);
 *   - e-mails go through Resend;
 *   - card data never reaches us (bank's hosted page); we keep only the
 *     payment reference, amount, currency and status;
 *   - the Google map on the Contacts page loads only after a click;
 *   - no analytics, no advertising, no marketing messages, no profiling.
 * The Android app has its own notice (content/legal/appPrivacy.ts).
 */
export const privacyDoc: LegalDoc = {
  slug: "privacy",
  version: LEGAL_VERSIONS.privacy,
  updated: versionDate(LEGAL_VERSIONS.privacy),
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази политика обяснява какви лични данни обработваме, когато разглеждате pizzapazzo.bg и поръчвате, защо, на какво основание, на кого ги предоставяме, колко време ги пазим и какви са правата ви.",
        en: "This policy explains which personal data we process when you browse pizzapazzo.bg and order, why, on which legal basis, who receives it, how long we keep it and what your rights are.",
      },
    },
  ],
  sections: [
    {
      id: "controller",
      heading: { bg: "1. Администратор", en: "1. Controller" },
      blocks: [
        {
          p: {
            bg: "Администратор на личните данни е търговецът, посочен в началото на тази страница. За всякакви въпроси за данните ви пишете на имейла ни или на адреса за кореспонденция. Не сме определили длъжностно лице по защита на данните, тъй като законът не го изисква за нашата дейност.",
            en: "The controller of your personal data is the merchant named at the top of this page. For any question about your data, e-mail us or write to the correspondence address. We have not appointed a data protection officer, as the law does not require one for our activity.",
          },
        },
      ],
    },
    {
      id: "data",
      heading: { bg: "2. Какви данни обработваме и защо", en: "2. What we process and why" },
      blocks: [
        {
          list: [
            {
              bg: "Поръчка: име, телефон, имейл, адрес за доставка, бележка, продуктите, сумите, начинът на плащане и статусът на поръчката — за да приготвим, доставим и потвърдим поръчката и да ви се обадим при нужда. Основание: изпълнение на договора (чл. 6, пар. 1, б. „б“ ОРЗД).",
              en: "Order: name, phone, e-mail, delivery address, note, the products, the amounts, the payment method and the order status — to prepare, deliver and confirm the order and to call you when needed. Basis: performance of the contract (Art. 6(1)(b) GDPR).",
            },
            {
              bg: "Потвърждения при поръчката: кои версии на Общите условия, Условията за отказ и тази политика сте потвърдили и в колко часа — като доказателство за сключения договор. Основание: законово задължение и легитимен интерес да докажем условията на договора (чл. 6, пар. 1, б. „в“ и „е“).",
              en: "Checkout confirmations: which versions of the Terms, the Cancellation terms and this policy you confirmed, and when — as evidence of the contract. Basis: legal obligation and our legitimate interest in proving the contract terms (Art. 6(1)(c) and (f)).",
            },
            {
              bg: "Плащане с карта: референция на плащането, сума, валута и статус, получени от банката. Данни на карта (номер, срок, CVV) не получаваме — те се въвеждат само на страницата на банката. Основание: изпълнение на договора и законови задължения.",
              en: "Card payment: the payment reference, amount, currency and status received from the bank. We never receive card data (number, expiry, CVV) — it is entered only on the bank's page. Basis: performance of the contract and legal obligations.",
            },
            {
              bg: "Профил (по желание): име, имейл, телефон, парола (само като необратим хеш), запазени адреси и история на поръчките. Основание: договор (чл. 6, пар. 1, б. „б“).",
              en: "Account (optional): name, e-mail, phone, password (only as an irreversible hash), saved addresses and order history. Basis: contract (Art. 6(1)(b)).",
            },
            {
              bg: "Рекламации и кореспонденция: съдържанието на съобщението и данните за контакт — за да отговорим и разрешим въпроса. Основание: договор и законово задължение.",
              en: "Complaints and correspondence: the message and contact details — to answer and resolve the matter. Basis: contract and legal obligation.",
            },
            {
              bg: "Технически данни: IP адрес и час на заявките в сървърните журнали на хостинга — за сигурност и отстраняване на грешки. Основание: легитимен интерес (чл. 6, пар. 1, б. „е“).",
              en: "Technical data: IP address and request times in the hosting provider's server logs — for security and troubleshooting. Basis: legitimate interest (Art. 6(1)(f)).",
            },
          ],
        },
        {
          p: {
            bg: "Данните за поръчката са необходими, за да я изпълним — без тях не можем да доставим. За тази обработка не искаме съгласие. Не изпращаме маркетингови съобщения, не правим профилиране и не продаваме данни.",
            en: "The order data is needed to carry out the order — without it we cannot deliver. We do not ask for consent for this processing. We send no marketing messages, do no profiling and do not sell data.",
          },
        },
      ],
    },
    {
      id: "recipients",
      heading: { bg: "3. Получатели и обработващи", en: "3. Recipients and processors" },
      blocks: [
        {
          list: [
            {
              bg: "Персоналът на Ресторанта, включително доставящият поръчката — само доколкото е нужно за нея.",
              en: "The Restaurant's staff, including whoever delivers the order — only as needed for it.",
            },
            {
              bg: "Render Services, Inc. (САЩ) — хостинг на сайта и базата данни (обработващ).",
              en: "Render Services, Inc. (USA) — hosting of the site and the database (processor).",
            },
            {
              bg: "Resend (Plus Five Five, Inc., САЩ) — изпращане на имейлите за поръчки (обработващ).",
              en: "Resend (Plus Five Five, Inc., USA) — sending the order e-mails (processor).",
            },
            {
              bg: "Обслужващата банка по виртуалния ПОС терминал — само когато плащате с карта; тя обработва данните на картата като самостоятелен администратор съгласно собствената си политика.",
              en: "The bank servicing the virtual POS terminal — only when you pay by card; it processes the card data as an independent controller under its own policy.",
            },
            {
              bg: "Google — само ако на страница „Контакти“ натиснете „Покажи картата“; тогава картата се зарежда от сървър на Google, който получава IP адреса ви и може да постави свои бисквитки.",
              en: "Google — only if you press “Show the map” on the Contacts page; the map then loads from a Google server, which receives your IP address and may set its own cookies.",
            },
            {
              bg: "Счетоводител и държавни органи — когато закон го изисква.",
              en: "Our accountant and public authorities — where the law requires it.",
            },
          ],
        },
        {
          p: {
            bg: "Когато обработващ съхранява данни извън Европейското икономическо пространство, предаването става при подходящи гаранции по глава V ОРЗД (решение за адекватност или стандартни договорни клаузи на Европейската комисия).",
            en: "Where a processor stores data outside the European Economic Area, the transfer takes place under appropriate safeguards under Chapter V GDPR (an adequacy decision or the European Commission's standard contractual clauses).",
          },
        },
      ],
    },
    {
      id: "retention",
      heading: { bg: "4. Срокове на съхранение", en: "4. Retention" },
      blocks: [
        {
          list: [
            {
              bg: "Данни за поръчка (включително потвържденията при поръчката): докато са нужни за изпълнението, рекламации и евентуални спорове — не по-дълго от общата петгодишна давност (чл. 110 от Закона за задълженията и договорите). Данните, които са част от счетоводни документи, се пазят за срока по Закона за счетоводството.",
              en: "Order data (including the checkout confirmations): as long as needed for delivery, complaints and possible disputes — no longer than the general five-year limitation period (Art. 110 of the Bulgarian Obligations and Contracts Act). Data forming part of accounting records is kept for the period set by the Accountancy Act.",
            },
            {
              bg: "Профил: докато не го изтриете. При изтриване премахваме профила, паролата и адресите, а от поръчките — името, имейла, телефона, адреса и бележката; остават само номер, дата, продукти и суми.",
              en: "Account: until you delete it. Deleting removes the account, the password and the addresses, and takes the name, e-mail, phone, address and note out of the orders; only the number, date, products and amounts remain.",
            },
            {
              bg: "Кореспонденция и рекламации: докато въпросът бъде разрешен и за срока на евентуален спор.",
              en: "Correspondence and complaints: until the matter is resolved and for the period of any dispute.",
            },
            {
              bg: "Сървърни журнали: за кратък технически срок, определен от хостинга.",
              en: "Server logs: for a short technical period set by the hosting provider.",
            },
          ],
        },
      ],
    },
    {
      id: "rights",
      heading: { bg: "5. Вашите права", en: "5. Your rights" },
      blocks: [
        {
          p: {
            bg: "Имате право на достъп, коригиране, изтриване, ограничаване на обработването, преносимост и възражение срещу обработване на основание легитимен интерес. Пишете ни на имейла или на адреса за кореспонденция — отговаряме до един месец. Профила си можете да изтриете и сами от страницата на профила.",
            en: "You have the right of access, rectification, erasure, restriction, portability and to object to processing based on legitimate interest. E-mail us or write to the correspondence address — we reply within one month. You can also delete your account yourself from your profile page.",
          },
        },
        {
          p: {
            bg: "Имате право да подадете жалба до Комисията за защита на личните данни: гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2, www.cpdp.bg.",
            en: "You have the right to lodge a complaint with the Bulgarian Commission for Personal Data Protection: 2 Prof. Tsvetan Lazarov Blvd., 1592 Sofia, www.cpdp.bg.",
          },
        },
      ],
    },
    {
      id: "contact",
      heading: { bg: "6. Контакт по въпроси за данните", en: "6. Contact about your data" },
      blocks: [{ dynamic: "contactChannels" }],
    },
    {
      id: "security",
      heading: { bg: "7. Сигурност", en: "7. Security" },
      blocks: [
        {
          p: {
            bg: "Връзката със сайта е криптирана (HTTPS). Паролите се пазят само като хеш, сесиите са в подписани httpOnly бисквитки, а достъпът до администрацията е ограничен по роли.",
            en: "The connection to the site is encrypted (HTTPS). Passwords are stored only as a hash, sessions use signed httpOnly cookies and access to the admin area is role-restricted.",
          },
        },
      ],
    },
    {
      id: "cookies",
      heading: { bg: "8. Бисквитки", en: "8. Cookies" },
      blocks: [
        {
          p: {
            bg: "Сайтът използва само технически необходими бисквитки и локално хранилище. Аналитични и рекламни бисквитки няма. Картата на Google се зарежда само след ваше действие. Подробности — в Политиката за бисквитки.",
            en: "The site uses only strictly necessary cookies and local storage. There are no analytics or advertising cookies. The Google map loads only after you ask for it. Details are in the Cookie Policy.",
          },
        },
      ],
    },
    {
      id: "children",
      heading: { bg: "9. Деца", en: "9. Children" },
      blocks: [
        {
          p: {
            bg: "Сайтът не е предназначен за създаване на профили от лица под 16 години без съгласието на родител или настойник.",
            en: "The site is not intended for account creation by persons under 16 without the consent of a parent or guardian.",
          },
        },
      ],
    },
    {
      id: "changes",
      heading: { bg: "10. Промени", en: "10. Changes" },
      blocks: [
        {
          p: {
            bg: "Датата и версията на политиката са посочени в началото. Версията, с която сте се запознали при поръчката, се записва заедно с поръчката.",
            en: "The date and version of this policy are shown at the top. The version you read when ordering is recorded with the order.",
          },
        },
      ],
    },
  ],
};
