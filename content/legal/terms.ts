import type { LegalDoc } from "./types";

/**
 * Общи условия / Terms and Conditions — DRAFT for client + lawyer review.
 * Reflects how the system actually works today: online orders for delivery,
 * cash on delivery only, prices in EUR — the only currency used on the site.
 */
export const termsDoc: LegalDoc = {
  slug: "terms",
  updated: "18.07.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Настоящите Общи условия уреждат отношенията между Pizza Pazzo LTD („ние“, „Ресторантът“) и потребителите („вие“, „Клиентът“) на сайта www.pizzapazzo.bg във връзка с разглеждането на менюто и подаването на онлайн поръчки за доставка на храна. Подавайки поръчка, вие декларирате, че сте се запознали с тези условия и ги приемате.",
        en: "These Terms and Conditions govern the relationship between Pizza Pazzo LTD (“we”, “the Restaurant”) and the users (“you”, “the Customer”) of www.pizzapazzo.bg in connection with browsing the menu and placing online food-delivery orders. By placing an order you confirm that you have read and accept these terms.",
      },
    },
  ],
  sections: [
    {
      heading: { bg: "1. Услугата", en: "1. The service" },
      blocks: [
        {
          p: {
            bg: "Сайтът предоставя дигитално меню и възможност за онлайн поръчка на храна и напитки с доставка до адрес. Поръчка може да се направи със или без регистрация (като гост).",
            en: "The site provides a digital menu and the ability to order food and drinks online for delivery to an address. Orders can be placed with or without registration (as a guest).",
          },
        },
      ],
    },
    {
      heading: { bg: "2. Цени", en: "2. Prices" },
      blocks: [
        {
          p: {
            bg: "Всички цени са в евро (EUR), с включен ДДС. Валидна е цената, показана в момента на подаване на поръчката. Таксата за доставка (ако има такава) се показва отделно в количката преди финализиране.",
            en: "All prices are shown in euro (EUR), VAT included. The price shown at the moment the order is placed applies. Any delivery fee is shown separately in the cart before you finalize.",
          },
        },
      ],
    },
    {
      heading: { bg: "3. Поръчка и сключване на договор", en: "3. Ordering and conclusion of contract" },
      blocks: [
        {
          p: {
            bg: "Поръчката преминава през следните стъпки: избор на продукти в количката → въвеждане на данни за контакт и адрес → преглед и потвърждаване. Подадената поръчка представлява предложение от ваша страна. Договорът се счита за сключен, когато Ресторантът приеме поръчката — ще получите потвърждение с ориентировъчно време за доставка (по имейл и/или телефон).",
            en: "An order goes through these steps: selecting products in the cart → entering contact details and address → review and confirmation. A submitted order constitutes an offer on your part. The contract is concluded when the Restaurant accepts the order — you will receive a confirmation with an estimated delivery time (by email and/or phone).",
          },
        },
        {
          p: {
            bg: "Ресторантът може да откаже поръчка при: изчерпан продукт, адрес извън районите за доставка, непълни или неверни данни за контакт, техническа грешка в цените, или извънредни обстоятелства. При отказ не дължите нищо; ще бъдете уведомени с причината.",
            en: "The Restaurant may decline an order in case of: an out-of-stock product, an address outside the delivery areas, incomplete or incorrect contact details, a technical pricing error, or extraordinary circumstances. If declined, you owe nothing and will be notified with the reason.",
          },
        },
      ],
    },
    {
      heading: { bg: "4. Плащане", en: "4. Payment" },
      blocks: [
        {
          p: {
            bg: "Към момента се приема само плащане с наложен платеж — в брой при получаване на доставката. Ако бъдат добавени други начини на плащане, те ще бъдат посочени при финализиране на поръчката.",
            en: "Currently only cash on delivery is accepted — payment in cash upon receiving your order. If additional payment methods are added, they will be listed at checkout.",
          },
        },
      ],
    },
    {
      heading: { bg: "5. Доставка", en: "5. Delivery" },
      blocks: [
        {
          p: {
            bg: "Условията за доставка (райони, такси, срокове, получаване) са описани в отделния документ „Условия за доставка“, който е неразделна част от настоящите Общи условия.",
            en: "Delivery conditions (areas, fees, times, handover) are described in the separate “Delivery Terms” document, which forms an integral part of these Terms.",
          },
        },
      ],
    },
    {
      heading: { bg: "6. Право на отказ", en: "6. Right of withdrawal" },
      blocks: [
        {
          p: {
            bg: "Приготвената по поръчка храна е бързоразвалящa се стока. Съгласно чл. 57 от Закона за защита на потребителите правото на отказ от договор от разстояние по чл. 50 ЗЗП не се прилага за доставка на храни и напитки, които подлежат на бързо разваляне или имат кратък срок на годност. Това не ограничава правата ви при рекламация (т. 7).",
            en: "Food prepared to order is a perishable good. Under Art. 57 of the Bulgarian Consumer Protection Act, the right of withdrawal from a distance contract under Art. 50 does not apply to the delivery of food and drinks that are perishable or have a short shelf life. This does not limit your rights to complain (section 7).",
          },
        },
      ],
    },
    {
      heading: { bg: "7. Рекламации", en: "7. Complaints" },
      blocks: [
        {
          p: {
            bg: "Моля, прегледайте поръчката при получаване. При липсващ, сгрешен или негоден продукт се свържете с нас незабавно на телефона или имейла, посочени по-долу. При основателна рекламация ще предложим замяна на продукта или възстановяване на платената за него сума. Правата ви по Закона за защита на потребителите не се ограничават от тези условия.",
            en: "Please check your order upon receipt. If an item is missing, wrong or unfit, contact us immediately using the phone or email below. For a justified complaint we will offer a replacement or a refund of the amount paid for the item. Your rights under the Consumer Protection Act are not limited by these terms.",
          },
        },
      ],
    },
    {
      heading: { bg: "8. Алергени", en: "8. Allergens" },
      blocks: [
        {
          p: {
            bg: "Информация за алергените по Регламент (ЕС) 1169/2011 е посочена към всеки продукт в менюто. Когато при продукт е отбелязано, че информацията се уточнява, или ако имате алергия — моля, свържете се с нас преди да поръчате. Храните се приготвят в обща кухня и следи от алергени не могат да бъдат напълно изключени.",
            en: "Allergen information under Regulation (EU) 1169/2011 is listed on each product in the menu. Where a product notes that the information is being confirmed, or if you have an allergy — please contact us before ordering. Food is prepared in a shared kitchen and traces of allergens cannot be fully excluded.",
          },
        },
      ],
    },
    {
      heading: { bg: "9. Профили", en: "9. Accounts" },
      blocks: [
        {
          p: {
            bg: "При регистрация се задължавате да предоставите верни данни и да пазите паролата си. Вие отговаряте за действията, извършени през профила ви. Можем да ограничим профил при злоупотреба (напр. системно неприемани поръчки, подадени с неверни данни).",
            en: "When registering you undertake to provide accurate details and to keep your password safe. You are responsible for activity performed through your account. We may restrict an account in case of abuse (e.g. repeated orders placed with false details).",
          },
        },
      ],
    },
    {
      heading: { bg: "10. Интелектуална собственост", en: "10. Intellectual property" },
      blocks: [
        {
          p: {
            bg: "Съдържанието на сайта — текстове, изображения, лого и оформление — е собственост на Pizza Pazzo LTD или се използва с разрешение и не може да се възпроизвежда без съгласие.",
            en: "The content of the site — texts, images, logo and layout — is the property of Pizza Pazzo LTD or used with permission, and may not be reproduced without consent.",
          },
        },
      ],
    },
    {
      heading: { bg: "11. Отговорност", en: "11. Liability" },
      blocks: [
        {
          p: {
            bg: "Полагаме грижа информацията на сайта да е точна и актуална, но не носим отговорност за вреди от невярно подадени от клиента данни (напр. грешен адрес или телефон), от независещи от нас технически прекъсвания, или от обстоятелства извън разумния ни контрол. Нищо в тези условия не изключва отговорност, която по закон не може да бъде изключена.",
            en: "We take care to keep the information on the site accurate and up to date, but we are not liable for damages caused by incorrect details provided by the customer (e.g. a wrong address or phone number), by technical interruptions beyond our control, or by circumstances outside our reasonable control. Nothing in these terms excludes liability that cannot be excluded by law.",
          },
        },
      ],
    },
    {
      heading: { bg: "12. Изменения", en: "12. Changes" },
      blocks: [
        {
          p: {
            bg: "Можем да актуализираме тези условия. Актуалната версия с датата на последна промяна е винаги достъпна на тази страница. За вече подадени поръчки важат условията към момента на поръчката.",
            en: "We may update these terms. The current version with its revision date is always available on this page. Orders already placed are governed by the terms in force at the time of ordering.",
          },
        },
      ],
    },
    {
      heading: { bg: "13. Приложимо право и спорове", en: "13. Governing law and disputes" },
      blocks: [
        {
          p: {
            bg: "Прилага се българското законодателство. Надзорен орган: Комисия за защита на потребителите (КЗП) — www.kzp.bg. При спор можете да използвате и Европейската платформа за онлайн решаване на спорове: ec.europa.eu/consumers/odr.",
            en: "Bulgarian law applies. Supervisory authority: the Bulgarian Commission for Consumer Protection (CPC) — www.kzp.bg. In case of a dispute you may also use the European Online Dispute Resolution platform: ec.europa.eu/consumers/odr.",
          },
        },
        {
          p: {
            bg: "При несъответствие между българската и английската версия на тези условия предимство има българската.",
            en: "In case of any discrepancy between the Bulgarian and the English version of these terms, the Bulgarian version prevails.",
          },
        },
      ],
    },
  ],
};
