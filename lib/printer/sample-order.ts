import type { Order } from "@/types/order";

/**
 * A representative order used ONLY for the live preview in
 * /admin/settings/print. Pure data, no database — the preview must react to
 * every keystroke, so it cannot depend on a real order being available.
 *
 * Deliberately exercises the awkward cases the owner needs to see before
 * committing to a layout: a multi-quantity line with per-unit extras, a long
 * dish name that has to wrap, an item note, and a customer note.
 */
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
  deliveryMethod: "DELIVERY",
  status: "ACCEPTED",

  subtotalEur: 34.19,
  deliveryFeeEur: 2.5,
  totalEur: 36.69,

  estimatedTimeMinutes: 30,
  adminNote: null,

  acceptedAt: "2026-08-03T09:12:00.000Z",
  cancelledAt: null,
  completedAt: null,

  createdAt: "2026-08-03T09:05:00.000Z",
  updatedAt: "2026-08-03T09:12:00.000Z",

  items: [
    {
      id: "preview-1",
      orderId: "preview",
      productId: "prod_margarita",
      productSlug: "margarita",
      productNameBg: "Маргарита",
      productNameEn: "Margherita",
      productImageUrl: null,
      variantId: "var_margarita_2",
      variantName: "40 см",
      quantity: 2,
      unitPriceEur: 10.23,
      totalPriceEur: 27.64,
      extras: [
        {
          key: "cheese_crust",
          sourceProductId: "prod_bord",
          type: "pizza_crust",
          nameBg: "Кашкавален борд",
          nameEn: "Cheese crust",
          quantity: 1,
          sizeContext: "40 см",
          unitPriceEur: 3.58,
          totalPriceEur: 3.58,
        },
        {
          key: "sauce:prod_chesnov_sos",
          sourceProductId: "prod_chesnov_sos",
          type: "sauce",
          nameBg: "Чеснов сос",
          nameEn: "Garlic sauce",
          quantity: 2,
          unitPriceEur: 1.02,
          totalPriceEur: 2.04,
        },
      ],
      itemNote: "По-препечена",
    },
    {
      id: "preview-2",
      orderId: "preview",
      productId: "prod_chinkue_patsoni",
      productSlug: "chinkue-patsoni",
      productNameBg: "Чинкуе Пацони със сушени домати",
      productNameEn: "Cinque Pazzoni",
      productImageUrl: null,
      variantId: null,
      variantName: null,
      quantity: 1,
      unitPriceEur: 6.55,
      totalPriceEur: 6.55,
      extras: [],
      itemNote: null,
    },
  ],
};
