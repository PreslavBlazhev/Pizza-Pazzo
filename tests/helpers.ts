/**
 * Shared fixtures for the payment tests.
 */
import { randomUUID } from "node:crypto";
import { placeOrder, type PlaceOrderResult } from "@/lib/checkout/place-order";
import type { Product } from "@/types/product";

/** A small fake menu — the tests must not depend on the real menu's prices. */
const MENU: Record<string, Product> = {
  prod_test_pizza: {
    id: "prod_test_pizza",
    name: "Тестова пица",
    slug: "testova-pica",
    description: "",
    categoryId: "cat_test",
    priceEur: 9.9,
    imageUrl: "/x.svg",
    allergens: [],
    isAvailable: true,
    sortOrder: 0,
    variants: [
      { id: "var_test_30", name: "30 см", priceEur: 9.9 },
      { id: "var_test_40", name: "40 см", priceEur: 13.45 },
    ],
  },
  prod_test_drink: {
    id: "prod_test_drink",
    name: "Тестова напитка",
    slug: "testova-napitka",
    description: "",
    categoryId: "cat_drinks",
    priceEur: 1.1,
    imageUrl: "/x.svg",
    allergens: [],
    isAvailable: true,
    sortOrder: 1,
  },
  prod_test_gone: {
    id: "prod_test_gone",
    name: "Изчерпан продукт",
    slug: "izcherpan",
    description: "",
    categoryId: "cat_test",
    priceEur: 5,
    imageUrl: "/x.svg",
    allergens: [],
    isAvailable: false,
    sortOrder: 2,
  },
};

export const deps = {
  getProduct: async (id: string) => MENU[id] ?? null,
};

/** All three explicit checkout confirmations, ticked (a checkbox posts "on"). */
export const ALL_CONSENTS = { consentTerms: "on", consentRefunds: "on", consentPrivacy: "on" } as const;

export const CONTACT = {
  customerName: "Тест Клиент",
  customerEmail: "client@example.test",
  customerPhone: "0888123456",
  deliveryCity: "Плевен",
  deliveryAddress: "ул. Тестова 1, вх. А",
  deliveryNote: "",
};

/** 2 × pizza 30 cm (9.90) + 1 × drink (1.10) = 20.90 € (delivery is free) */
export const STANDARD_ITEMS = JSON.stringify([
  { productId: "prod_test_pizza", variantId: "var_test_30", quantity: 2 },
  { productId: "prod_test_drink", quantity: 1 },
]);
export const STANDARD_TOTAL_MINOR = 2090;

export function key(): string {
  return randomUUID();
}

export async function order(
  method: "cash_on_delivery" | "card_online",
  overrides: Partial<{ itemsJson: string; checkoutKey: string }> = {}
): Promise<Extract<PlaceOrderResult, { ok: true }>> {
  const result = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: overrides.itemsJson ?? STANDARD_ITEMS,
      paymentMethod: method,
      checkoutKey: overrides.checkoutKey ?? key(),
      userId: null,
      consents: ALL_CONSENTS,
    },
    deps
  );
  if (!result.ok) throw new Error(`placeOrder failed: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Counts "new order" e-mails by the log line the sender writes when no Resend
 * key is configured (always the case in tests). One line = one e-mail that
 * would have been sent.
 */
export function captureNotificationLog() {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    countFor(orderNumber: number) {
      return lines.filter((l) => l.includes("skipping notification") && l.includes(`#${orderNumber}`))
        .length;
    },
    restore() {
      console.warn = original;
    },
  };
}

/** Silences the expected error/log noise of failure scenarios. */
export function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  return fn().finally(() => {
    console.log = log;
    console.error = error;
  });
}
