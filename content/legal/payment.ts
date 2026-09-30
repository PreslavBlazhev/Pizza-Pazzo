import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Начини на плащане / Payment methods.
 *
 * Which method is active RIGHT NOW is the dynamic "paymentMethods" block — it
 * reads the same configuration checkout uses, so this page can never claim
 * card acceptance that checkout does not offer. The rest describes how a card
 * payment works once the virtual POS is live, written so that it stays true.
 */
export const paymentDoc: LegalDoc = {
  slug: "payment",
  version: LEGAL_VERSIONS.payment,
  updated: versionDate(LEGAL_VERSIONS.payment),
  intro: [
    {
      p: {
        bg: "Тази страница описва как можете да платите поръчката си. Тя е част от Общите условия.",
        en: "This page describes how you can pay for your order. It forms part of the Terms and Conditions.",
      },
    },
  ],
  sections: [
    {
      id: "methods",
      heading: { bg: "1. Налични начини на плащане", en: "1. Available payment methods" },
      blocks: [{ dynamic: "paymentMethods" }],
    },
    {
      id: "cash",
      heading: { bg: "2. В брой при доставка", en: "2. Cash on delivery" },
      blocks: [
        {
          p: {
            bg: "Плащате общата сума от поръчката на куриера при получаване. Сумата е същата, която виждате преди да потвърдите поръчката и в имейла за приемане.",
            en: "You pay the order total to the courier on delivery. It is the same amount you see before confirming the order and in the acceptance e-mail.",
          },
        },
      ],
    },
    {
      id: "card",
      heading: { bg: "3. Онлайн с дебитна или кредитна карта", en: "3. Online by debit or credit card" },
      blocks: [
        {
          list: [
            {
              bg: "Когато плащането с карта е активно, след натискане на „Поръчай и плати с карта“ ви пренасочваме към защитената платежна страница на обслужващата банка (виртуален ПОС терминал). Там въвеждате данните на картата и при нужда я потвърждавате чрез банката си (3-D Secure).",
              en: "When card payment is active, after pressing “Order and pay by card” you are taken to the servicing bank's secure payment page (virtual POS terminal). You enter your card details there and, if needed, confirm with your bank (3-D Secure).",
            },
            {
              bg: "Номерът, срокът на валидност и CVV кодът на картата се въвеждат само на страницата на банката. Ние не ги получаваме, не ги виждаме и не ги съхраняваме.",
              en: "The card number, expiry date and CVV code are entered only on the bank's page. We never receive, see or store them.",
            },
            {
              bg: "Плащате в евро точно сумата на поръчката, изчислена от нашия сървър.",
              en: "You pay, in euro, exactly the order total calculated by our server.",
            },
            {
              bg: "Поръчката стига до кухнята едва след като банката потвърди плащането директно на нашия сървър. Ако плащането бъде отказано, прекъснато или не бъде потвърдено, поръчката не се изпълнява — можете да опитате отново или да поръчате с плащане в брой. Ако видите блокирана или изтеглена сума без потвърдена поръчка, не плащайте повторно, а се свържете с нас: проверяваме транзакцията при банката.",
              en: "The order reaches the kitchen only after the bank confirms the payment directly to our server. If the payment is declined, interrupted or not confirmed, the order is not carried out — you can try again or order with cash payment. If you see an amount held or taken without a confirmed order, do not pay again; contact us and we will check the transaction with the bank.",
            },
            {
              bg: "Възстановяване на сума, платена с карта, става само по същата карта — вижте „Отказ, връщане и рекламации“.",
              en: "An amount paid by card is refunded only to the same card — see “Cancellation, Returns and Complaints”.",
            },
          ],
        },
      ],
    },
    {
      id: "not-offered",
      heading: { bg: "4. Какво не предлагаме", en: "4. What we do not offer" },
      blocks: [
        {
          p: {
            bg: "Не запазваме карти, не правим повтарящи се или абонаментни плащания и не предлагаме плащане с Apple Pay, Google Pay или чрез линк за плащане.",
            en: "We do not save cards, make recurring or subscription payments, or offer Apple Pay, Google Pay or pay-by-link.",
          },
        },
      ],
    },
  ],
};
