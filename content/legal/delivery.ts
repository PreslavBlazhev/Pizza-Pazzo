import type { LegalDoc } from "./types";

/**
 * Условия за доставка / Delivery Terms — DRAFT for client review.
 *
 * ⚠️ The delivery zones, fee and minimum order are STILL UNCONFIRMED by the
 * client (docs/client-delivery-questions.md). The text deliberately points to
 * the cart as the source of the current fee instead of hardcoding numbers, so
 * this page stays true when the real values arrive.
 */
export const deliveryDoc: LegalDoc = {
  slug: "delivery",
  updated: "18.07.2026",
  intro: [
    {
      p: {
        bg: "Тези условия описват как работи доставката на поръчки от Pizza Pazzo. Те са неразделна част от Общите условия.",
        en: "These terms describe how Pizza Pazzo deliveries work. They form an integral part of the Terms and Conditions.",
      },
    },
  ],
  sections: [
    {
      heading: { bg: "1. Райони и такса за доставка", en: "1. Delivery areas and fee" },
      blocks: [
        {
          p: {
            bg: "Доставяме в рамките на обявените райони на града. Актуалната такса за доставка се показва в количката преди финализиране на поръчката. Ако адресът ви е извън районите ни, ще се свържем с вас, преди да приемем или откажем поръчката.",
            en: "We deliver within the announced areas of the city. The current delivery fee is shown in the cart before you finalize your order. If your address is outside our areas, we will contact you before accepting or declining the order.",
          },
        },
      ],
    },
    {
      heading: { bg: "2. Време за доставка", en: "2. Delivery time" },
      blocks: [
        {
          p: {
            bg: "При приемане на поръчката ще получите ориентировъчно време за доставка. То зависи от натовареността, разстоянието и пътната обстановка и не е гарантиран срок. При очаквано значително закъснение ще ви уведомим по телефона.",
            en: "When your order is accepted you will receive an estimated delivery time. It depends on how busy we are, the distance and traffic, and is not a guaranteed deadline. If a significant delay is expected we will call you.",
          },
        },
      ],
    },
    {
      heading: { bg: "3. Кога приемаме поръчки", en: "3. When we accept orders" },
      blocks: [
        {
          p: {
            bg: "Поръчки се приемат в работното време на ресторанта, обявено на страница „Контакти“ и във футъра на сайта. Поръчка, подадена извън работно време, ще бъде обработена при отваряне или отказана с уведомление.",
            en: "Orders are accepted during the restaurant's working hours, published on the Contacts page and in the site footer. An order placed outside working hours will be processed at opening or declined with a notification.",
          },
        },
      ],
    },
    {
      heading: { bg: "4. Получаване", en: "4. Handover" },
      blocks: [
        {
          p: {
            bg: "Моля, посочете точен адрес (вход, етаж, апартамент) и телефон, на който отговаряте. Ако куриерът не успее да се свърже с вас на адреса и по телефона в разумен срок, поръчката се счита за неуспешно доставена по вина на клиента; при повторна заявка може да бъде начислена нова такса за доставка.",
            en: "Please provide an exact address (entrance, floor, apartment) and a phone number you answer. If the courier cannot reach you at the address or by phone within a reasonable time, the delivery is considered failed due to the customer; a repeated delivery may incur a new delivery fee.",
          },
        },
        {
          p: {
            bg: "Прегледайте поръчката при получаване. Забележки за липсващи или сгрешени продукти приемаме най-лесно на момента — по телефона, посочен на сайта.",
            en: "Please check your order on receipt. Missing or wrong items are easiest to resolve immediately — by phone, using the number on the site.",
          },
        },
      ],
    },
    {
      heading: { bg: "5. Плащане при доставка", en: "5. Payment on delivery" },
      blocks: [
        {
          p: {
            bg: "Плащането се извършва в брой при получаване (наложен платеж). Ще ви бъде издаден касов бон. Стойността на поръчката се вижда в потвърждението и в количката преди подаване.",
            en: "Payment is in cash on delivery. You will receive a fiscal receipt. The order total is visible in the confirmation and in the cart before you submit.",
          },
        },
      ],
    },
    {
      heading: { bg: "6. Връзка с нас", en: "6. Contact" },
      blocks: [
        {
          p: {
            bg: "За всичко около текуща доставка ни търсете на телефоните и имейла, посочени на страница „Контакти“ — това е най-бързият начин.",
            en: "For anything about an ongoing delivery, reach us at the phone numbers and email on the Contacts page — that is the fastest way.",
          },
        },
      ],
    },
  ],
};
