import type { LegalDoc } from "./types";
import { LEGAL_VERSIONS, versionDate } from "./versions";

/**
 * Условия за доставка / Delivery Terms — part of the Terms.
 *
 * The area, the hours and the payment methods are dynamic blocks rendered
 * from lib/delivery-area.ts, Admin → Settings and the payment configuration,
 * so this page always says what checkout enforces. Delivery is free (owner
 * decision 2026-09-27); there is no minimum order and no pickup in the site.
 */
export const deliveryDoc: LegalDoc = {
  slug: "delivery",
  version: LEGAL_VERSIONS.delivery,
  updated: versionDate(LEGAL_VERSIONS.delivery),
  intro: [
    {
      p: {
        bg: "Тези условия описват как доставяме поръчките от сайта. Те са част от Общите условия.",
        en: "These terms describe how we deliver orders placed on the site. They form part of the Terms and Conditions.",
      },
    },
  ],
  sections: [
    {
      id: "method",
      heading: { bg: "1. Начин на получаване", en: "1. How you receive the order" },
      blocks: [
        {
          p: {
            bg: "Поръчките от сайта се доставят до посочения от вас адрес. Вземане от ресторанта („вземи сам“) чрез сайта не се предлага.",
            en: "Orders from the site are delivered to the address you give. Collecting the order yourself (“takeaway”) is not offered through the site.",
          },
        },
      ],
    },
    {
      id: "area",
      heading: { bg: "2. Район на доставка", en: "2. Delivery area" },
      blocks: [
        { dynamic: "deliveryArea" },
        {
          p: {
            bg: "Поръчка с адрес в друго населено място не се приема — проверява се при поръчката, включително от нашия сървър. Ако адрес в града е труден за достъп или твърде отдалечен, ще ви се обадим, преди да приемем или откажем поръчката.",
            en: "An order with an address in another town is not accepted — this is checked at checkout, including by our server. If an address in town is hard to reach or too far, we will call you before accepting or declining the order.",
          },
        },
      ],
    },
    {
      id: "cost",
      heading: { bg: "3. Цена на доставката и минимална поръчка", en: "3. Delivery cost and minimum order" },
      blocks: [
        {
          p: {
            bg: "Доставката е безплатна — плащате само поръчаните продукти. Сайтът не изисква минимална сума на поръчката.",
            en: "Delivery is free — you pay only for the products ordered. The site requires no minimum order amount.",
          },
        },
      ],
    },
    {
      id: "hours",
      heading: { bg: "4. Кога приемаме поръчки", en: "4. When we take orders" },
      blocks: [
        { dynamic: "workingHours" },
        {
          p: {
            bg: "Извън работното време, или когато Ресторантът временно е спрял поръчките (например при голяма натовареност), сайтът показва, че не приема поръчки, и не позволява подаването им.",
            en: "Outside opening hours, or when the Restaurant has temporarily paused orders (for example when very busy), the site says it is not taking orders and does not let you place one.",
          },
        },
      ],
    },
    {
      id: "time",
      heading: { bg: "5. Време за доставка", en: "5. Delivery time" },
      blocks: [
        {
          p: {
            bg: "Не обещаваме фиксиран срок. При приемане на поръчката ви изпращаме имейл с ориентировъчното време за доставка, което персоналът определя според натовареността и разстоянието. При значително закъснение ще ви се обадим.",
            en: "We do not promise a fixed time. When we accept the order we e-mail you the estimated delivery time, which our staff set according to how busy we are and the distance. If there is a significant delay we will call you.",
          },
        },
      ],
    },
    {
      id: "handover",
      heading: { bg: "6. Предаване", en: "6. Handover" },
      blocks: [
        {
          p: {
            bg: "Посочете точен адрес (вход, етаж, апартамент) и телефон, на който отговаряте. Ако куриерът не може да ви открие на адреса и по телефона в разумен срок, доставката се счита за неуспешна поради причина у Клиента.",
            en: "Give an exact address (entrance, floor, apartment) and a phone number you answer. If the courier cannot find you at the address or by phone within a reasonable time, the delivery is treated as failed for a reason on the Customer's side.",
          },
        },
        {
          p: {
            bg: "Прегледайте поръчката при получаване. Липсващи или сгрешени продукти се решават най-лесно на момента — вижте „Отказ, връщане и рекламации“.",
            en: "Check your order on delivery. Missing or wrong products are easiest to sort out on the spot — see “Cancellation, Returns and Complaints”.",
          },
        },
      ],
    },
    {
      id: "payment",
      heading: { bg: "7. Плащане", en: "7. Payment" },
      blocks: [
        { dynamic: "paymentMethods" },
        {
          p: {
            bg: "За продажбата получавате фискален документ съгласно законодателството.",
            en: "You receive a fiscal document for the sale as required by law.",
          },
        },
      ],
    },
    {
      id: "contact",
      heading: { bg: "8. Връзка с нас", en: "8. Contact" },
      blocks: [{ dynamic: "contactChannels" }],
    },
  ],
};
