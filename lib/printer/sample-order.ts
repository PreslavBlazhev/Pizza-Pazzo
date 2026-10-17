import type { Order, OrderItem } from "@/types/order";
import type { OrderItemExtra } from "@/lib/extras-rules";
import { pizzaMathDiscount } from "@/lib/pizza-math";

/**
 * A representative order used ONLY for the live preview in
 * /admin/settings/print (and the e-mail preview script). Pure data, no
 * database — the preview must react to every keystroke, so it cannot depend
 * on a real order being available.
 *
 * Synthetic, but built the way checkout builds a real order, so the preview
 * shows what the kitchen will really get:
 *   - the lines arrive MIXED (burger, pizza, salad, pizza, sauce, drink,
 *     pizza) and the ticket regroups them, pizzas first, sauces last;
 *   - the same pizza twice with different modifications stays two lines;
 *   - sauces chosen ON dishes (2 × 2 garlic sauces, 1 burger sauce) plus a
 *     garlic sauce ordered on its own add up in the sauce section (5 + 1);
 *   - a two-pizza combo, computed by the real lib/pizza-math.ts;
 *   - a long name that has to wrap, an item note and a customer note.
 */

const sauce = (id: string, name: string, nameEn: string, quantity: number): OrderItemExtra => ({
  key: `sauce:${id}`,
  sourceProductId: id,
  type: "sauce",
  nameBg: name,
  nameEn,
  quantity,
  unitPriceEur: 1.02,
  totalPriceEur: Math.round(1.02 * quantity * 100) / 100,
});

type Line = Omit<OrderItem, "id" | "orderId" | "discountEur" | "productImageUrl">;

const cat = (id: string, nameBg: string, nameEn: string, sortOrder: number) => ({
  categoryId: id,
  categoryNameBg: nameBg,
  categoryNameEn: nameEn,
  categorySortOrder: sortOrder,
});
const PIZZA = cat("cat_pizzas_standard", "Стандартни пици", "Standard pizzas", 1);

const LINES: Line[] = [
  {
    productId: "prod_pileshki",
    productSlug: "pileshki",
    productNameBg: "Пилешки",
    productNameEn: "Chicken",
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPriceEur: 7.67,
    totalPriceEur: 8.69,
    extras: [sauce("prod_burger_sos", "Бургер сос", "Burger sauce", 1)],
    itemNote: null,
    ...cat("cat_burgers", "Бургери", "Burgers", 5),
  },
  {
    productId: "prod_margarita",
    productSlug: "margarita",
    productNameBg: "Маргарита",
    productNameEn: "Margherita",
    variantId: "var_margarita_2",
    variantName: "40 см / 40 cm",
    quantity: 2,
    unitPriceEur: 10.23,
    // (10.23 + 4.60 crust + 2 × 1.02 sauce) × 2
    totalPriceEur: 33.74,
    extras: [
      {
        key: "cheese_crust",
        sourceProductId: "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord",
        sourceVariantId: "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_2",
        type: "pizza_crust",
        nameBg: "Кашкавален борд",
        nameEn: "Cheese crust",
        quantity: 1,
        sizeContext: "40 см",
        unitPriceEur: 4.6,
        totalPriceEur: 4.6,
      },
      sauce("prod_chesnov_sos", "Чеснов сос", "Garlic sauce", 2),
    ],
    itemNote: null,
    ...PIZZA,
  },
  {
    productId: "prod_shopska_2",
    productSlug: "shopska-salata",
    productNameBg: "Шопска",
    productNameEn: "Shopska",
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPriceEur: 8,
    totalPriceEur: 8,
    extras: [],
    itemNote: "Без лук",
    ...cat("cat_salads", "Салати", "Salads", 7),
  },
  {
    productId: "prod_peperoni_maks",
    productSlug: "peperoni-maks",
    productNameBg: "Пеперони Макс",
    productNameEn: "Pepperoni Max",
    variantId: "var_peperoni_maks_2",
    variantName: "40 см / 40 cm",
    quantity: 1,
    unitPriceEur: 12.78,
    totalPriceEur: 12.78,
    extras: [],
    itemNote: "Добре изпечена, нарязана на 8 парчета",
    ...PIZZA,
  },
  {
    productId: "prod_chesnov_sos",
    productSlug: "chesnov-sos",
    productNameBg: "Чеснов сос",
    productNameEn: "Garlic sauce",
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPriceEur: 1.02,
    totalPriceEur: 1.02,
    extras: [],
    itemNote: null,
    ...cat("cat_sauces", "Сосове", "Sauces", 8),
  },
  {
    productId: "prod_coca_cola",
    productSlug: "coca-cola",
    productNameBg: "Coca-Cola",
    productNameEn: "Coca-Cola",
    variantId: "var_coca_cola_2",
    variantName: "1 л / 1 l",
    quantity: 1,
    unitPriceEur: 2.3,
    totalPriceEur: 2.3,
    extras: [],
    itemNote: null,
    ...cat("cat_drinks", "Безалкохолни напитки и бира", "Soft drinks and beer", 10),
  },
  {
    productId: "prod_peperoni_maks",
    productSlug: "peperoni-maks",
    productNameBg: "Пеперони Макс",
    productNameEn: "Pepperoni Max",
    variantId: "var_peperoni_maks_1",
    variantName: "30 см / 30 cm",
    quantity: 1,
    unitPriceEur: 9.71,
    totalPriceEur: 9.71,
    extras: [],
    itemNote: null,
    ...PIZZA,
  },
];

const offer = pizzaMathDiscount(
  LINES.map((l, i) => ({
    key: `L${i}`,
    categoryId: l.categoryId ?? "",
    variantName: l.variantName,
    baseUnitEur: l.unitPriceEur,
    quantity: l.quantity,
  }))
);

const ITEMS: OrderItem[] = LINES.map((l, i) => ({
  ...l,
  id: `preview-${i + 1}`,
  orderId: "preview",
  productImageUrl: null,
  discountEur: offer.lineDiscountsEur[`L${i}`] ?? 0,
}));

const subtotalCents = ITEMS.reduce((s, i) => s + Math.round(i.totalPriceEur * 100), 0);
const nameOf = (key: string) => {
  const l = LINES[Number(key.slice(1))];
  return `${l.productNameBg} ${l.variantName?.split(" / ")[0] ?? ""}`.trim();
};

export const SAMPLE_PRINT_ORDER: Order = {
  id: "preview",
  orderNumber: 1042,
  userId: null,

  customerName: "Иван Петров",
  customerEmail: "ivan@example.com",
  customerPhone: "+359 88 123 4567",

  deliveryAddress: "ул. Георги Кочев 13, вх. Б, ет. 3, ап. 12",
  deliveryCity: "Плевен",
  deliveryNote: "Звънете при пристигане, звънецът не работи.",

  paymentMethod: "CASH_ON_DELIVERY",
  paymentStatus: "CASH_DUE",
  paidAt: null,
  releasedToKitchenAt: "2026-08-03T12:00:00.000Z",
  isTest: false,
  paymentAlert: null,
  paymentAlertAckAt: null,
  paymentAlertAckBy: null,
  notificationStatus: null,
  notificationAttempts: 0,
  notificationError: null,
  deliveryMethod: "DELIVERY",
  status: "ACCEPTED",

  subtotalEur: subtotalCents / 100,
  discountEur: offer.discountEur,
  totalEur: (subtotalCents - offer.discountCents) / 100,
  offer: offer.pairs.map((p) => ({
    sizes: p.sizes,
    comboEur: p.comboEur,
    regularEur: p.regularEur,
    discountEur: p.discountEur,
    pizzasBg: [nameOf(p.lineKeys[0]), nameOf(p.lineKeys[1])],
  })),

  estimatedTimeMinutes: 30,
  adminNote: null,

  acceptedAt: "2026-08-03T09:12:00.000Z",
  cancelledAt: null,
  completedAt: null,
  anonymizedAt: null,
  consent: { termsVersion: null, refundsVersion: null, privacyVersion: null, recordedAt: null },

  createdAt: "2026-08-03T09:05:00.000Z",
  updatedAt: "2026-08-03T09:12:00.000Z",

  items: ITEMS,
};
