import type { LegalDoc } from "./types";

/**
 * Откази, рекламации и възстановяване / Cancellations, Complaints & Refunds
 * — DRAFT for client + lawyer review. Expands on Terms §§6–7 (право на отказ /
 * рекламации) with the practical detail customers actually look for. Reflects
 * how the system works today: cash-on-delivery only, no card payments yet, so
 * "refund" in practice means either not charging the customer or a cash
 * hand-back — the wording is written to stay correct once card payments exist.
 */
export const refundsDoc: LegalDoc = {
  slug: "refunds",
  updated: "20.07.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази страница обяснява кога и как можете да анулирате поръчка, как подавате рекламация и как работи възстановяването на суми. Тя доразвива Общите условия (т. 6 и 7) с практическите стъпки и не ги замества.",
        en: "This page explains when and how you can cancel an order, how to file a complaint, and how refunds work. It expands on the Terms and Conditions (sections 6 and 7) with the practical steps and does not replace them.",
      },
    },
  ],
  sections: [
    {
      heading: {
        bg: "1. Анулиране преди началото на приготвянето",
        en: "1. Cancelling before preparation starts",
      },
      blocks: [
        {
          p: {
            bg: "Можете да анулирате поръчката безплатно, докато тя все още не е приета от ресторанта или в кратък период веднага след приемането, преди кухнята да е започнала приготвянето ѝ. Обадете се на телефона по-долу възможно най-скоро — колкото по-рано, толкова по-сигурно е анулирането да е безплатно.",
            en: "You may cancel free of charge while the order has not yet been accepted by the restaurant, or in the short window right after acceptance, before the kitchen has started preparing it. Call the phone number below as soon as possible — the earlier you call, the more certain a free cancellation is.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "2. Ограничения при вече приготвена храна",
        en: "2. Limits once food has been prepared",
      },
      blocks: [
        {
          p: {
            bg: "Храната се приготвя по поръчка. Съгласно чл. 57 от Закона за защита на потребителите, правото на отказ по чл. 50 ЗЗП не се прилага за бързоразвалящи се хранителни продукти — затова поръчка, чието приготвяне вече е започнало или е приключило, не може да бъде анулирана безплатно и не подлежи на връщане поради „размислих“. Това не засяга правото ви на рекламация при проблем с получената поръчка (т. 3–4 по-долу).",
            en: "Food is prepared to order. Under Art. 57 of the Bulgarian Consumer Protection Act, the right of withdrawal under Art. 50 does not apply to perishable food — so an order whose preparation has started or finished cannot be cancelled free of charge or returned simply because you changed your mind. This does not affect your right to complain about a problem with the order you received (sections 3–4 below).",
          },
        },
      ],
    },
    {
      heading: {
        bg: "3. Грешна или липсваща позиция",
        en: "3. Wrong or missing item",
      },
      blocks: [
        {
          p: {
            bg: "Прегледайте поръчката веднага при получаване. Ако липсва продукт или е доставен различен от поръчания, свържете се с нас незабавно — най-лесно е проблемът да се реши на място или в рамките на същия ден. Ще предложим доставка на липсващия/верния продукт или възстановяване на платената за него сума.",
            en: "Please check your order as soon as it arrives. If an item is missing or the wrong item was delivered, contact us immediately — it is easiest to resolve on the spot or the same day. We will offer delivery of the missing/correct item or a refund of the amount paid for it.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "4. Проблем с качеството",
        en: "4. A quality problem",
      },
      blocks: [
        {
          p: {
            bg: "Ако получен продукт е с нарушено качество (напр. студен извън разумното при доставка, недопечен, увреден при транспорт), уведомете ни в деня на доставката. При основателна рекламация ще предложим замяна на засегнатия продукт или възстановяване на стойността му. Правата ви по Закона за защита на потребителите не се ограничават от тази страница.",
            en: "If a delivered item has a quality issue (e.g. unreasonably cold on arrival, undercooked, damaged in transit), let us know on the day of delivery. For a justified complaint we will offer a replacement of the affected item or a refund of its value. Your rights under the Consumer Protection Act are not limited by this page.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "5. Как да подадете рекламация",
        en: "5. How to file a complaint",
      },
      blocks: [
        {
          list: [
            {
              bg: "Свържете се с нас на телефона или имейла, посочени на страница „Контакти“ — по телефона получавате най-бърз отговор.",
              en: "Contact us at the phone number or email on the Contacts page — phone gets you the fastest response.",
            },
            {
              bg: "Направете го възможно най-скоро, в деня на доставката — така проблемът се проверява и решава най-лесно.",
              en: "Do it as soon as possible, on the day of delivery — that makes the issue easiest to verify and resolve.",
            },
          ],
        },
      ],
    },
    {
      heading: {
        bg: "6. Каква информация ни е нужна",
        en: "6. What information we need",
      },
      blocks: [
        {
          list: [
            {
              bg: "Номер на поръчката (изпратен ви при потвърждението).",
              en: "Your order number (sent to you in the confirmation).",
            },
            {
              bg: "Кратко описание на проблема — какво липсва, какво е сгрешено или какъв е дефектът.",
              en: "A short description of the problem — what is missing, what is wrong, or what the defect is.",
            },
            {
              bg: "По възможност снимка на получената поръчка, ако проблемът е видим.",
              en: "A photo of the order you received, if the problem is visible, where possible.",
            },
          ],
        },
      ],
    },
    {
      heading: {
        bg: "7. Начин и срок за възстановяване",
        en: "7. Refund method and timeframe",
      },
      blocks: [
        {
          p: {
            bg: "Плащането е с наложен платеж (в брой при доставка), затова при основателна рекламация възстановяването обичайно става веднага — в брой при повторна доставка на верния продукт, или чрез намаляване на дължимата сума при следваща поръчка, по договорка с вас. Ако бъдат добавени други начини на плащане (напр. с карта), възстановяването ще се извършва по същия начин, по който е платено, обичайно в срок до 14 дни от потвърждаване на основателността на рекламацията.",
            en: "Payment is cash on delivery, so for a justified complaint a refund is usually handled immediately — in cash on redelivery of the correct item, or offset against your next order, as agreed with you. If other payment methods (e.g. card) are added, refunds will be made using the same method used to pay, normally within 14 days of the complaint being confirmed as justified.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "8. Приложимо право",
        en: "8. Governing law",
      },
      blocks: [
        {
          p: {
            bg: "Прилага се българското законодателство, включително Законът за защита на потребителите. Надзорен орган: Комисия за защита на потребителите (КЗП) — www.kzp.bg. Съдържанието на тази страница е обща информация и не представлява индивидуална правна консултация.",
            en: "Bulgarian law applies, including the Consumer Protection Act. Supervisory authority: the Bulgarian Commission for Consumer Protection (CPC) — www.kzp.bg. The content of this page is general information and does not constitute individual legal advice.",
          },
        },
      ],
    },
  ],
};
