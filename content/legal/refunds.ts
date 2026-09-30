import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Отказ, връщане, рекламации и възстановяване на суми / Cancellation, Returns,
 * Complaints and Refunds — the document a customer accepts at checkout
 * together with the Terms.
 *
 * Mirrors the real process (docs/UBB-OPERATIONS.md):
 *   - cancellation is by phone/e-mail; staff cancel the order in the admin
 *     while it is PENDING or ACCEPTED (before PREPARING);
 *   - a card refund is made by the restaurant in the bank's virtual-POS
 *     merchant portal — the site never "refunds" by changing a status;
 *   - the bank's crediting time is not promised.
 * Section ids are linked from checkout and the Terms.
 */
export const refundsDoc: LegalDoc = {
  slug: "refunds",
  version: LEGAL_VERSIONS.refunds,
  updated: versionDate(LEGAL_VERSIONS.refunds),
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тук е описано как и до кога можете да откажете поръчка, кога имате право на отказ от договора и как се връща стока, как се подава рекламация и как и в какъв срок се възстановяват платени суми. Документът е част от Общите условия.",
        en: "This page explains how and until when you can cancel an order, when you have a right of withdrawal and how goods are returned, how to complain, and how and when amounts paid are refunded. It forms part of the Terms and Conditions.",
      },
    },
  ],
  sections: [
    {
      id: "cancel",
      heading: { bg: "1. Отказ от поръчка от ваша страна", en: "1. Cancelling your order" },
      blocks: [
        {
          list: [
            {
              bg: "До кога: докато кухнята не е започнала приготвянето — т.е. докато поръчката е в статус „Очаква потвърждение“ или „Прието“ (преди „Приготвя се“). Отказът е безплатен.",
              en: "Until when: as long as the kitchen has not started preparing it — that is, while the order is “Awaiting confirmation” or “Accepted” (before “Preparing”). Cancelling is free.",
            },
            {
              bg: "Как: обадете се на телефона на Ресторанта (най-бързо) или пишете на имейла ни с номера на поръчката. Отказът е в сила, когато персоналът го потвърди.",
              en: "How: call the Restaurant (fastest) or e-mail us with the order number. The cancellation takes effect when our staff confirm it.",
            },
            {
              bg: "След започване на приготвянето поръчката не може да бъде отменена: храната се приготвя специално за вас и дължите цената ѝ. Платена с карта сума в този случай не се възстановява.",
              en: "Once preparation has started the order cannot be cancelled: the food is made specially for you and its price is due. An amount paid by card is not refunded in that case.",
            },
            {
              bg: "Неустойки: Ресторантът не начислява неустойки или други такси за отказ.",
              en: "Penalties: the Restaurant charges no penalties or other cancellation fees.",
            },
          ],
        },
        { dynamic: "contactChannels" },
      ],
    },
    {
      id: "restaurant-cancel",
      heading: { bg: "2. Когато Ресторантът откаже поръчката", en: "2. When the Restaurant declines the order" },
      blocks: [
        {
          p: {
            bg: "Ако не можем да изпълним поръчката (изчерпан продукт, адрес извън района, невъзможност за доставка), ви се обаждаме на посочения телефон. Не дължите нищо. Ако сте платили с карта, възстановяваме цялата сума по картата (т. 6).",
            en: "If we cannot fulfil the order (a product has run out, the address is outside the area, delivery is impossible), we call you on the phone number you gave. You owe nothing. If you paid by card, we refund the whole amount to the card (section 6).",
          },
        },
      ],
    },
    {
      id: "withdrawal",
      heading: { bg: "3. Право на отказ от договора (14 дни)", en: "3. Right of withdrawal (14 days)" },
      blocks: [
        {
          p: {
            bg: "Не се прилага за храната: всички ястия, сосове и десерти се приготвят по поръчка и бързо се развалят, затова по чл. 57, т. 3 и т. 4 от Закона за защита на потребителите (чл. 16, б. „в“ и „г“ от Директива 2011/83/ЕС) за тях няма право на отказ. Това не засяга правото на рекламация (т. 5).",
            en: "Not applicable to food: every dish, sauce and dessert is prepared to order and perishes quickly, so under Art. 57(3) and (4) of the Bulgarian Consumer Protection Act (Art. 16(c) and (d) of Directive 2011/83/EU) there is no right of withdrawal for them. This does not affect your right to complain (section 5).",
          },
        },
        {
          p: {
            bg: "Прилага се за неотворени фабрично затворени напитки с дълъг срок на годност (например бутилирани безалкохолни напитки, вода и бира):",
            en: "Applies to unopened factory-sealed drinks with a long shelf life (for example bottled soft drinks, water and beer):",
          },
        },
        {
          list: [
            {
              bg: "Срок: 14 дни от деня, в който сте получили напитките, без да посочвате причина.",
              en: "Deadline: 14 days from the day you received the drinks, without giving any reason.",
            },
            {
              bg: "Как: изпратете ни ясно изявление (например имейл) или попълнения стандартен формуляр по-долу на имейла или на адреса за кореспонденция. Достатъчно е да го изпратите преди изтичане на срока.",
              en: "How: send us a clear statement (for example an e-mail) or the completed standard form below, to our e-mail or correspondence address. Sending it before the deadline is enough.",
            },
            {
              bg: "Връщане: върнете неотворените напитки в оригиналната им опаковка до 14 дни след изявлението — като ги донесете в ресторанта (без разходи) или ги изпратите за своя сметка. Ако предпочитате, уговорете с нас да ги вземем при следваща доставка.",
              en: "Return: return the unopened drinks in their original packaging within 14 days of your statement — by bringing them to the restaurant (no cost) or sending them at your own expense. If you prefer, arrange with us to collect them with a later delivery.",
            },
            {
              bg: "Отговорност: отговаряте за намалената стойност на напитка, която е отворена или повредена.",
              en: "Liability: you are responsible for the reduced value of a drink that has been opened or damaged.",
            },
            {
              bg: "Възстановяване: връщаме платената за напитките цена без неоправдано забавяне и не по-късно от 14 дни от получаване на изявлението, със същото платежно средство. Можем да го задържим, докато получим напитките обратно. Доставката е безплатна, затова няма такса за доставка за възстановяване.",
              en: "Refund: we refund the price paid for the drinks without undue delay and no later than 14 days after receiving your statement, using the same means of payment. We may withhold it until we have the drinks back. Delivery is free, so there is no delivery charge to refund.",
            },
          ],
        },
      ],
    },
    {
      id: "form",
      heading: { bg: "4. Стандартен формуляр за отказ", en: "4. Standard withdrawal form" },
      blocks: [{ dynamic: "withdrawalForm" }],
    },
    {
      id: "complaints",
      heading: { bg: "5. Рекламации", en: "5. Complaints" },
      blocks: [
        {
          list: [
            {
              bg: "Кога: възможно най-скоро след получаване, по възможност в деня на доставката — прясната храна може да бъде проверена само тогава.",
              en: "When: as soon as possible after delivery, ideally on the same day — fresh food can only be checked then.",
            },
            {
              bg: "Как: по телефона или имейла на Ресторанта, или писмено на адреса за кореспонденция.",
              en: "How: by the Restaurant's phone or e-mail, or in writing to the correspondence address.",
            },
            {
              bg: "Какво да посочите: номер на поръчката, какво липсва, какво е сгрешено или какъв е проблемът, и по възможност снимка. Запазете продукта, докато го прегледаме.",
              en: "What to include: the order number, what is missing or wrong or what the problem is, and a photo if you can. Keep the product until we have looked at it.",
            },
            {
              bg: "Решение: при основателна рекламация доставяме липсващия или верния продукт или възстановяваме платената за него сума, по ваш избор, без разходи за вас. Отговаряме на всяка рекламация и ви съобщаваме решението.",
              en: "Outcome: for a justified complaint we deliver the missing or correct product or refund what you paid for it, as you prefer, at no cost to you. We answer every complaint and tell you the decision.",
            },
          ],
        },
        {
          p: {
            bg: "За храната няма гаранционен или извънгаранционен сервиз — не е приложим за продукти за незабавна консумация. Това не ограничава правото на рекламация и законовите ви права при несъответствие с договора.",
            en: "There is no in- or out-of-warranty service for food — it does not apply to products for immediate consumption. This does not limit your right to complain or your statutory rights for goods that do not conform to the contract.",
          },
        },
      ],
    },
    {
      id: "refunds",
      heading: { bg: "6. Възстановяване на платени суми", en: "6. Refunds of amounts paid" },
      blocks: [
        {
          p: {
            bg: "Кога възстановяваме:",
            en: "When we refund:",
          },
        },
        {
          list: [
            {
              bg: "поръчка, платена с карта, която Ресторантът не е приел или е отказал — цялата сума;",
              en: "a card-paid order the Restaurant did not accept or declined — the whole amount;",
            },
            {
              bg: "поръчка, отказана от вас преди започване на приготвянето — цялата сума;",
              en: "an order you cancelled before preparation started — the whole amount;",
            },
            {
              bg: "двойно плащане на една и съща поръчка — излишното плащане;",
              en: "a double payment for the same order — the extra payment;",
            },
            {
              bg: "сума, изтеглена при плащане, което не е довело до изпълнена поръчка (установено при проверка на транзакцията) — цялата сума;",
              en: "an amount taken by a payment that did not lead to a fulfilled order (established by checking the transaction) — the whole amount;",
            },
            {
              bg: "липсващ продукт или основателна рекламация, когато изберете възстановяване — сумата за съответния продукт (частично възстановяване);",
              en: "a missing product or a justified complaint where you choose a refund — the amount for that product (partial refund);",
            },
            {
              bg: "упражнено право на отказ за напитки (т. 3) — цената на върнатите напитки.",
              en: "a withdrawal for drinks (section 3) — the price of the drinks returned.",
            },
          ],
        },
        {
          p: {
            bg: "Как: сума, платена с карта чрез виртуалния ПОС терминал, се възстановява само по картата, с която е направено плащането. Възстановяването се нарежда от Ресторанта през системата на обслужващата банка — не в брой и не по друга сметка. Сума, платена в брой, се връща в брой или по посочена от вас банкова сметка.",
            en: "How: an amount paid by card through the virtual POS terminal is refunded only to the card used for the payment. The Restaurant orders the refund through the servicing bank's system — not in cash and not to another account. An amount paid in cash is returned in cash or to a bank account you give us.",
          },
        },
        {
          p: {
            bg: "Срок: Ресторантът нарежда възстановяването без неоправдано забавяне и не по-късно от 14 дни от възникване на основанието. Кога сумата ще се отрази по сметката ви не зависи от нас — определя се от банката, издала картата ви, и от картовата организация (Visa, Mastercard и др.). При нужда ви изпращаме потвърждение, че възстановяването е наредено.",
            en: "Timing: the Restaurant orders the refund without undue delay and no later than 14 days after the reason for it arises. When the money appears on your account does not depend on us — the bank that issued your card and the card scheme (Visa, Mastercard, etc.) decide it. On request we send you confirmation that the refund has been ordered.",
          },
        },
        {
          p: {
            bg: "Непотвърдено плащане: ако банката не е потвърдила плащането, поръчката не се изпълнява. Липсата на потвърждение обаче не доказва, че по картата няма движение. Ако видите блокирана или изтеглена сума, свържете се с нас с номера на поръчката — проверяваме транзакцията в системата на банката. Ако сумата е изтеглена, а поръчката не е изпълнена, я възстановяваме по същата карта (т. 6). Блокирана, но неусвоена сума се освобождава от банката, издала картата, в нейните срокове.",
            en: "Unconfirmed payment: if the bank has not confirmed the payment, the order is not carried out. A missing confirmation does not, however, prove that nothing moved on the card. If you see an amount held or taken, contact us with the order number — we check the transaction in the bank's system. If the amount was taken and the order not carried out, we refund it to the same card (section 6). An amount only held (not captured) is released by the bank that issued the card, on its own timescale.",
          },
        },
      ],
    },
    {
      id: "law",
      heading: { bg: "7. Приложимо право", en: "7. Governing law" },
      blocks: [
        {
          p: {
            bg: "Прилага се българското законодателство. Нищо в този документ не ограничава правата ви по Закона за защита на потребителите. Можете да се обърнете към Комисията за защита на потребителите (www.kzp.bg) и към помирителните комисии към нея.",
            en: "Bulgarian law applies. Nothing in this document limits your rights under the Consumer Protection Act. You may turn to the Commission for Consumer Protection (www.kzp.bg) and its conciliation committees.",
          },
        },
      ],
    },
  ],
};
