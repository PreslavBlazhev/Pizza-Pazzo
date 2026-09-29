import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Общи условия / Terms and Conditions.
 *
 * Written against how the system actually works (verified in code on
 * 2026-09-29): delivery only, the town of Pleven, free delivery, prices in EUR,
 * cash on delivery always available, online card payment only while it is
 * switched on (the "paymentMethods" block says which is true right now), the
 * order statuses in lib/order-status.ts, the "order accepted" e-mail as the
 * acceptance, and a phone call when the restaurant declines.
 *
 * The facts that live in configuration (merchant, contacts, hours, area,
 * payment methods) are dynamic blocks — see ./types.ts.
 */
export const termsDoc: LegalDoc = {
  slug: "terms",
  version: LEGAL_VERSIONS.terms,
  updated: versionDate(LEGAL_VERSIONS.terms),
  // The merchant is section 1 (anchor #merchant), so no separate box.
  showCompanyBox: false,
  intro: [
    {
      p: {
        bg: "Настоящите Общи условия уреждат договора за покупко-продажба от разстояние между търговеца, посочен по-долу („Ресторантът“, „ние“), и всеки потребител („Клиентът“, „вие“), който поръчва храна и напитки чрез сайта pizzapazzo.bg или мобилното приложение Pizza Pazzo, което отваря същия сайт. Преди да подадете поръчка, трябва изрично да потвърдите, че приемате тези условия и Условията за отказ, връщане и рекламации, и че сте запознати с Политиката за поверителност.",
        en: "These Terms and Conditions govern the distance sales contract between the merchant named below (“the Restaurant”, “we”) and every consumer (“the Customer”, “you”) who orders food and drinks through pizzapazzo.bg or the Pizza Pazzo mobile app, which opens the same website. Before you place an order you must expressly confirm that you accept these terms and the Cancellation, Returns and Complaints terms, and that you have read the Privacy Policy.",
      },
    },
  ],
  sections: [
    {
      id: "merchant",
      heading: { bg: "1. Търговец", en: "1. The merchant" },
      blocks: [{ dynamic: "merchant" }],
    },
    {
      id: "subject",
      heading: { bg: "2. Предмет", en: "2. Subject matter" },
      blocks: [
        {
          p: {
            bg: "Ресторантът продава приготвена по поръчка храна (пици, бургери, салати, предястия, сосове, десерти) и напитки, които доставя до посочен от Клиента адрес. Сайтът показва менюто, цените, наличността и алергените и позволява поръчка с или без регистрация.",
            en: "The Restaurant sells food prepared to order (pizzas, burgers, salads, starters, sauces, desserts) and drinks, delivered to an address the Customer provides. The site shows the menu, prices, availability and allergens and lets you order with or without an account.",
          },
        },
      ],
    },
    {
      id: "products",
      heading: { bg: "3. Продукти, изображения и алергени", en: "3. Products, images and allergens" },
      blocks: [
        {
          p: {
            bg: "Към всеки продукт са посочени наименование, описание (когато има), размер или грамаж, възможните добавки и цената им. Изображенията, отбелязани като илюстративни, не представят конкретния продукт. Продукт, отбелязан като неналичен, не може да бъде поръчан.",
            en: "Each product shows its name, a description (where available), its size or weight, the extras that can be added and their prices. Images marked as illustrative do not show the actual product. A product marked unavailable cannot be ordered.",
          },
        },
        {
          p: {
            bg: "Алергените по Регламент (ЕС) № 1169/2011 са посочени към всеки продукт. Когато при продукт пише, че информацията се уточнява, или ако имате алергия или непоносимост — свържете се с нас преди да поръчате. Храната се приготвя в обща кухня и следи от алергени не могат да бъдат изключени.",
            en: "Allergens under Regulation (EU) No 1169/2011 are listed for each product. Where a product says the information is being confirmed, or if you have an allergy or intolerance, contact us before ordering. Food is prepared in a shared kitchen and traces of allergens cannot be excluded.",
          },
        },
      ],
    },
    {
      id: "prices",
      heading: { bg: "4. Цени", en: "4. Prices" },
      blocks: [
        {
          p: {
            bg: "Всички цени са крайни, в евро (EUR), с включен ДДС. Доставката е безплатна и към поръчката не се добавят такси за опаковка, обслужване или плащане. Цената на добавките се показва до всяка добавка и се включва в цената на продукта. Преди потвърждаване на поръчката виждате всеки продукт с размера и добавките му и общата сума за плащане.",
            en: "All prices are final, in euro (EUR), VAT included. Delivery is free and no packaging, service or payment fee is added. The price of each extra is shown next to it and included in the product's price. Before confirming, you see every product with its size and extras and the total amount due.",
          },
        },
        {
          p: {
            bg: "Дължимата сума се изчислява от нашия сървър по цените в менюто към момента на поръчката — стойност, променена в браузъра, не се взема предвид. При явна техническа грешка в цена ще се свържем с вас преди приемане на поръчката; можете да се откажете без разходи.",
            en: "The amount due is calculated by our server from the menu prices at the time of the order — a value changed in the browser is ignored. If a price is obviously wrong because of a technical error, we will contact you before accepting the order and you may withdraw at no cost.",
          },
        },
      ],
    },
    {
      id: "ordering",
      heading: { bg: "5. Поръчка и сключване на договора", en: "5. Ordering and conclusion of the contract" },
      blocks: [
        {
          list: [
            {
              bg: "Избирате продукти (размер и добавки) и ги добавяте в количката.",
              en: "You choose products (size and extras) and add them to the cart.",
            },
            {
              bg: "В страницата за поръчка въвеждате име, телефон, имейл и адрес за доставка, избирате начин на плащане и изрично потвърждавате условията.",
              en: "On the checkout page you enter your name, phone, e-mail and delivery address, choose a payment method and expressly confirm the terms.",
            },
            {
              bg: "С натискане на бутона „Поръчка със задължение за плащане“ (или „Поръчай и плати с карта“) изпращате поръчката. Това е вашето предложение за сключване на договор. Показваме номер на поръчката.",
              en: "By pressing “Order with obligation to pay” (or “Order and pay by card”) you submit the order. This is your offer to conclude the contract. We show you the order number.",
            },
            {
              bg: "Договорът се сключва, когато Ресторантът приеме поръчката. Тогава ви изпращаме имейл „Поръчката ви е приета“ с продуктите, общата сума, адреса и ориентировъчното време за доставка.",
              en: "The contract is concluded when the Restaurant accepts the order. We then send you an “Your order has been accepted” e-mail with the products, the total, the address and the estimated delivery time.",
            },
          ],
        },
        {
          p: {
            bg: "При плащане с карта плащането се извършва веднага след изпращане на поръчката, на защитената страница на банката. Поръчката стига до кухнята едва след като банката потвърди плащането. Ако плащането не бъде потвърдено, поръчката не се изпълнява и нищо не ви се удържа.",
            en: "With card payment you pay right after submitting the order, on the bank's secure page. The order reaches the kitchen only once the bank confirms the payment. If the payment is not confirmed, the order is not carried out and nothing is charged.",
          },
        },
        {
          p: {
            bg: "Ресторантът може да не приеме поръчка при изчерпан продукт, адрес извън района за доставка, непълни или неверни данни за контакт, явна техническа грешка в цена или обстоятелства, които правят изпълнението невъзможно. Тогава ви уведомяваме по телефона и не дължите нищо; платената с карта сума се възстановява изцяло (т. 10).",
            en: "The Restaurant may decline an order if a product has run out, the address is outside the delivery area, contact details are incomplete or false, a price is obviously wrong because of a technical error, or circumstances make delivery impossible. We then tell you by phone and you owe nothing; an amount paid by card is refunded in full (section 10).",
          },
        },
      ],
    },
    {
      id: "payment",
      heading: { bg: "6. Плащане", en: "6. Payment" },
      blocks: [
        { dynamic: "paymentMethods" },
        {
          p: {
            bg: "Подробности — в страницата „Начини на плащане“. Не събираме и не съхраняваме номер, срок на валидност или CVV код на карта.",
            en: "Details are on the “Payment methods” page. We never collect or store a card number, expiry date or CVV code.",
          },
        },
      ],
    },
    {
      id: "delivery",
      heading: { bg: "7. Доставка и работно време", en: "7. Delivery and opening hours" },
      blocks: [
        { dynamic: "deliveryArea" },
        { dynamic: "workingHours" },
        {
          p: {
            bg: "Ориентировъчното време за доставка ви съобщаваме при приемане на поръчката; то зависи от натовареността и разстоянието и не е гарантиран срок. Подробности — в „Условия за доставка“, които са част от тези Общи условия.",
            en: "We tell you the estimated delivery time when we accept the order; it depends on how busy we are and on distance and is not a guaranteed deadline. Details are in the “Delivery Terms”, which form part of these Terms.",
          },
        },
      ],
    },
    {
      id: "cancellation",
      heading: { bg: "8. Отказ от направена поръчка", en: "8. Cancelling an order" },
      blocks: [
        {
          p: {
            bg: "Можете да откажете поръчката без никакви разходи, докато кухнята не е започнала да я приготвя — обадете се на телефона на Ресторанта (най-бързият начин) или пишете на имейла ни с номера на поръчката. След започване на приготвянето поръчката не може да бъде отменена, защото храната се приготвя специално за вас; дължи се цената на поръчката. Ресторантът не начислява неустойки или допълнителни такси за отказ. Подробности и сроковете за възстановяване — в „Отказ, връщане и рекламации“.",
            en: "You may cancel the order at no cost as long as the kitchen has not started preparing it — call the Restaurant (the fastest way) or e-mail us with the order number. Once preparation has started the order cannot be cancelled, because the food is made specially for you; the order price is then due. The Restaurant charges no penalties or extra fees for cancelling. Details and refund times are in “Cancellation, Returns and Complaints”.",
          },
        },
      ],
    },
    {
      id: "withdrawal",
      heading: { bg: "9. Право на отказ от договора (14 дни)", en: "9. Right of withdrawal (14 days)" },
      blocks: [
        {
          p: {
            bg: "Правото на отказ от договор от разстояние в 14-дневен срок (чл. 50 от Закона за защита на потребителите) не се прилага за храна, приготвена по поръчка, и за стоки, които могат бързо да се развалят или имат кратък срок на годност (чл. 57, т. 3 и т. 4 ЗЗП; чл. 16, б. „в“ и „г“ от Директива 2011/83/ЕС). Това се отнася за всички ястия, сосове и десерти в менюто.",
            en: "The 14-day right of withdrawal from a distance contract (Art. 50 of the Bulgarian Consumer Protection Act) does not apply to food made to order and to goods that can deteriorate quickly or have a short shelf life (Art. 57(3) and (4) of the Act; Art. 16(c) and (d) of Directive 2011/83/EU). This covers every dish, sauce and dessert on the menu.",
          },
        },
        {
          p: {
            bg: "За неотворени фабрично затворени напитки с дълъг срок на годност (например бутилирани безалкохолни напитки, вода и бира) правото на отказ се запазва: можете да се откажете в 14 дни от получаването им. Как — в „Отказ, връщане и рекламации“, където е и стандартният формуляр за отказ.",
            en: "For unopened factory-sealed drinks with a long shelf life (for example bottled soft drinks, water and beer) the right of withdrawal remains: you may withdraw within 14 days of receiving them. How to do it — and the standard withdrawal form — is in “Cancellation, Returns and Complaints”.",
          },
        },
        {
          p: {
            bg: "Изключението от правото на отказ не ограничава правото ви на рекламация, когато получената поръчка не отговаря на договореното (т. 11).",
            en: "The exception from the right of withdrawal does not limit your right to complain when the order you received does not match what was agreed (section 11).",
          },
        },
      ],
    },
    {
      id: "refunds",
      heading: { bg: "10. Възстановяване на суми", en: "10. Refunds" },
      blocks: [
        {
          p: {
            bg: "Сума, платена с карта чрез виртуалния ПОС терминал, се възстановява само по картата, с която е направено плащането. Ресторантът нарежда възстановяването без неоправдано забавяне и не по-късно от 14 дни от възникване на основанието. Кога сумата ще се отрази по сметката ви зависи от банката, издала картата, и от картовата организация. Случаите и процедурата са описани в „Отказ, връщане и рекламации“.",
            en: "An amount paid by card through the virtual POS terminal is refunded only to the card used for the payment. The Restaurant orders the refund without undue delay and no later than 14 days after the reason for it arises. When it appears on your account depends on the bank that issued your card and on the card scheme. The cases and the procedure are described in “Cancellation, Returns and Complaints”.",
          },
        },
      ],
    },
    {
      id: "complaints",
      heading: { bg: "11. Рекламации", en: "11. Complaints" },
      blocks: [
        {
          p: {
            bg: "Моля, прегледайте поръчката при получаване. При липсващ, сгрешен, увреден или негоден продукт се свържете с нас възможно най-скоро, по възможност още в деня на доставката, по телефона или имейла на Ресторанта, с номера на поръчката и описание (по възможност и снимка). При основателна рекламация доставяме липсващия или верния продукт или възстановяваме платената за него сума, по ваш избор, без разходи за вас. Отговаряме на всяка рекламация и ви уведомяваме за решението.",
            en: "Please check your order on delivery. If a product is missing, wrong, damaged or unfit, contact us as soon as possible, ideally on the day of delivery, by the Restaurant's phone or e-mail, with the order number and a description (a photo helps). For a justified complaint we deliver the missing or correct product or refund what you paid for it, as you prefer, at no cost to you. We answer every complaint and tell you the decision.",
          },
        },
        {
          p: {
            bg: "Правата ви като потребител по българското законодателство, включително при несъответствие на стоката с договора, не се ограничават от тези условия.",
            en: "Your consumer rights under Bulgarian law, including for goods that do not conform to the contract, are not limited by these terms.",
          },
        },
      ],
    },
    {
      id: "warranty",
      heading: { bg: "12. Гаранционен и извънгаранционен сервиз", en: "12. Warranty and after-sales service" },
      blocks: [
        {
          p: {
            bg: "Ресторантът продава само храна и напитки за незабавна консумация. За тях търговска гаранция и технически сервиз (гаранционен или извънгаранционен) не са приложими, защото няма какво да бъде ремонтирано или поддържано. Това не отменя правото на рекламация по т. 11 и законовите права при несъответствие.",
            en: "The Restaurant sells only food and drinks for immediate consumption. A commercial guarantee and technical (in- or out-of-warranty) service do not apply to them, because there is nothing to repair or maintain. This does not remove the right to complain under section 11 or the statutory rights for non-conforming goods.",
          },
        },
      ],
    },
    {
      id: "subscriptions",
      heading: { bg: "13. Абонаменти", en: "13. Subscriptions" },
      blocks: [
        {
          p: {
            bg: "Всяка поръчка е еднократна. Сайтът не предлага абонаменти, периодични доставки или автоматични повтарящи се плащания и не запазва данни на карти.",
            en: "Every order is a one-off. The site offers no subscriptions, recurring deliveries or automatic repeat payments and does not store card details.",
          },
        },
      ],
    },
    {
      id: "accounts",
      heading: { bg: "14. Профили", en: "14. Accounts" },
      blocks: [
        {
          p: {
            bg: "Регистрацията не е задължителна. Ако създадете профил, се задължавате да посочите верни данни и да пазите паролата си. Можете да изтриете профила си по всяко време от страницата на профила.",
            en: "An account is optional. If you create one, you undertake to give accurate details and keep your password safe. You can delete your account at any time from your profile page.",
          },
        },
      ],
    },
    {
      id: "personal-data",
      heading: { bg: "15. Лични данни", en: "15. Personal data" },
      blocks: [
        {
          p: {
            bg: "Обработваме данните ви, за да изпълним поръчката — как и на какво основание, е описано в Политиката за поверителност. Не е нужно да давате съгласие за това, а маркетингови съобщения не изпращаме.",
            en: "We process your data to carry out the order — how and on which legal basis is described in the Privacy Policy. Your consent is not needed for this, and we send no marketing messages.",
          },
        },
      ],
    },
    {
      id: "liability",
      heading: { bg: "16. Отговорност", en: "16. Liability" },
      blocks: [
        {
          p: {
            bg: "Не отговаряме за забавяне или неизпълнение, причинени от неверни данни, подадени от Клиента (например грешен адрес или телефон), или от обстоятелства извън разумния ни контрол. Нищо в тези условия не изключва отговорност, която по закон не може да бъде изключена.",
            en: "We are not liable for delay or non-performance caused by wrong details given by the Customer (e.g. a wrong address or phone number) or by circumstances outside our reasonable control. Nothing in these terms excludes liability that cannot be excluded by law.",
          },
        },
        {
          p: {
            bg: "Съдържанието на сайта — текстове, изображения, лого и оформление — принадлежи на Ресторанта или се използва с разрешение.",
            en: "The content of the site — texts, images, logo and layout — belongs to the Restaurant or is used with permission.",
          },
        },
      ],
    },
    {
      id: "changes",
      heading: { bg: "17. Изменения и версии", en: "17. Changes and versions" },
      blocks: [
        {
          p: {
            bg: "Датата и версията на тези условия са посочени в началото. При промяна публикуваме нова версия. За всяка поръчка важи версията, която сте приели при поръчката — тя се записва заедно с поръчката.",
            en: "The date and version of these terms are shown at the top. When they change we publish a new version. Each order is governed by the version you accepted when ordering — it is recorded with the order.",
          },
        },
      ],
    },
    {
      id: "disputes",
      heading: { bg: "18. Приложимо право и спорове", en: "18. Governing law and disputes" },
      blocks: [
        {
          p: {
            bg: "Прилага се българското право. Ако не сме разрешили спора помежду си, можете да се обърнете към Комисията за защита на потребителите (www.kzp.bg) или към помирителните комисии към нея за извънсъдебно решаване на потребителски спорове, както и към компетентния български съд.",
            en: "Bulgarian law applies. If we have not resolved a dispute between us, you may turn to the Bulgarian Commission for Consumer Protection (www.kzp.bg) or its conciliation committees for out-of-court resolution of consumer disputes, and to the competent Bulgarian court.",
          },
        },
        {
          p: {
            bg: "При несъответствие между българския и английския текст предимство има българският.",
            en: "If the Bulgarian and English texts differ, the Bulgarian text prevails.",
          },
        },
      ],
    },
  ],
};
