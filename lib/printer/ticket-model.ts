/**
 * The kitchen/delivery ticket's CONTENT, in print order — the one
 * transformation every print path uses:
 *   - the 80 mm web ticket and its live preview (lib/printer/ticket-template.ts),
 *   - the Android app's Bluetooth printer (lib/android-printer.ts), for the
 *     first print and every reprint.
 *
 * Rules (owner, 2026-10-17):
 *   1. Lines are grouped by their menu CATEGORY (the snapshot taken at
 *      checkout, OrderItem.category*): pizzas first, then the other
 *      categories in the menu's own order — never "пица, бургер, пица".
 *      Within a category the lines keep the order the customer added them.
 *   2. Every main line reads "<qty> x <Категория>: <Име>" — "Пица:
 *      Маргарита", "Бургер: Пилешки". The prefix is a short form of the REAL
 *      category (KITCHEN_CATEGORY_LABELS) or the category's own name; a line
 *      with no category snapshot (an order placed before this change) prints
 *      the plain product name — no category is ever guessed for an item.
 *   3. Size, crusts/toppings/burger add-ons and the item note stay under the
 *      dish. Lines are never merged: two Margheritas with different toppings
 *      or notes are two lines.
 *   4. SAUCES are identified by data, not by name: an extra of type "sauce"
 *      (its source product is validated to be in the sauces category at
 *      checkout — lib/extras-resolve.ts) or a line of the sauces category.
 *      They are NOT printed under the dish; they are summed into one last
 *      section, by product (and variant/packaging):
 *         2 pizzas × 2 garlic sauces each + 1 garlic sauce ordered alone
 *         → "5 x Сосове: Чеснов сос".
 *      A sauce line ordered on its own WITH a note keeps its own row, so the
 *      instruction is not lost. Nothing is counted twice: the dish's printed
 *      price no longer contains its sauces, the sauce row carries them, and
 *      the two add up to exactly the order's lines.
 *
 * Pure: plain data in, plain data out. Relative imports only.
 */
import { SAUCES_CATEGORY_ID, PIZZA_CATEGORY_IDS } from "../extras-rules";
import { toOrderExtrasDisplay, type OrderExtraDisplay } from "../order-extras-display";
import type { OrderItem } from "../../types/order";

/** Short kitchen labels for the menu's real categories (stable ids). */
export const KITCHEN_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  cat_pizzas_standard: "Пица",
  cat_pizzas_special: "Специална пица",
  cat_starters: "Предястие",
  cat_burgers: "Бургер",
  cat_salads: "Салата",
  cat_sauces: "Сосове",
  cat_desserts: "Десерт",
  cat_drinks: "Напитка",
};

/** The menu order of those categories (seed sortOrder), used when a snapshot lacks one. */
const DEFAULT_CATEGORY_ORDER: Readonly<Record<string, number>> = {
  cat_pizzas_standard: 1,
  cat_pizzas_special: 2,
  cat_pizza_addons: 3,
  cat_starters: 4,
  cat_burgers: 5,
  cat_burger_addons: 6,
  cat_salads: 7,
  cat_sauces: 8,
  cat_desserts: 9,
  cat_drinks: 10,
};

export interface TicketDishLine {
  /** "Пица: Маргарита" — or just the name for a line without a category. */
  label: string;
  categoryLabel: string | null;
  name: string;
  quantity: number;
  size: string | null;
  /** Crusts, toppings, burger add-ons — sauces are in `sauces`. */
  extras: OrderExtraDisplay[];
  note: string | null;
  /** The line total WITHOUT its sauces (they are priced in the sauce rows). */
  totalPriceEur: number;
}

export interface TicketGroup {
  categoryId: string | null;
  categoryLabel: string | null;
  lines: TicketDishLine[];
}

export interface TicketSauceLine {
  /** "Сосове: Чеснов сос". */
  label: string;
  name: string;
  /** Total pieces across the whole order. */
  quantity: number;
  /** Packaging/size when the sauce product has variants. */
  size: string | null;
  note: string | null;
  totalPriceEur: number;
}

export interface TicketModel {
  groups: TicketGroup[];
  sauces: TicketSauceLine[];
}

const cents = (n: number) => Math.round(n * 100);

function categoryLabelOf(item: Pick<OrderItem, "categoryId" | "categoryNameBg">): string | null {
  if (!item.categoryId) return null;
  return KITCHEN_CATEGORY_LABELS[item.categoryId] ?? (item.categoryNameBg?.trim() || null);
}

/** Sort rank of a category: pizzas first, then menu order, unknown last. */
function categoryRank(item: Pick<OrderItem, "categoryId" | "categorySortOrder">): [number, number] {
  const id = item.categoryId;
  if (!id) return [2, Number.MAX_SAFE_INTEGER];
  if ((PIZZA_CATEGORY_IDS as readonly string[]).includes(id)) {
    return [0, item.categorySortOrder ?? DEFAULT_CATEGORY_ORDER[id] ?? 0];
  }
  return [1, item.categorySortOrder ?? DEFAULT_CATEGORY_ORDER[id] ?? Number.MAX_SAFE_INTEGER - 1];
}

function isSauceLine(item: Pick<OrderItem, "categoryId">): boolean {
  return item.categoryId === SAUCES_CATEGORY_ID;
}

const SAUCE_LABEL = KITCHEN_CATEGORY_LABELS[SAUCES_CATEGORY_ID];

export function buildTicketModel(order: { items?: readonly OrderItem[] | null }): TicketModel {
  const items = order.items ?? [];

  // ── Sauces: from the extras of every line and from sauce lines ──
  const sauces = new Map<string, TicketSauceLine & { order: number }>();
  const addSauce = (key: string, row: Omit<TicketSauceLine, "label">, priceCents: number) => {
    const found = sauces.get(key);
    if (found) {
      found.quantity += row.quantity;
      found.totalPriceEur = (cents(found.totalPriceEur) + priceCents) / 100;
      return;
    }
    sauces.set(key, {
      ...row,
      label: `${SAUCE_LABEL}: ${row.name}`,
      totalPriceEur: priceCents / 100,
      order: sauces.size,
    });
  };

  // ── Dishes, grouped by category ──
  const groups = new Map<string, TicketGroup & { rank: [number, number]; first: number }>();

  items.forEach((item, index) => {
    const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;

    if (isSauceLine(item)) {
      const note = item.itemNote?.trim() || null;
      const key = `p:${item.productId}|v:${item.variantId ?? ""}${note ? `|n:${index}` : ""}`;
      addSauce(
        key,
        {
          name: item.productNameBg,
          quantity: qty,
          size: item.variantName ? item.variantName.split(" / ")[0] : null,
          note,
          totalPriceEur: 0,
        },
        cents(item.totalPriceEur)
      );
      return;
    }

    const all = toOrderExtrasDisplay(item.extras, "bg");
    const sauceExtras = (item.extras ?? []).filter((e) => e.type === "sauce");
    let sauceCents = 0;
    for (const e of sauceExtras) {
      const pieces = e.quantity * qty;
      const price = cents(e.totalPriceEur) * qty;
      sauceCents += price;
      addSauce(
        `p:${e.sourceProductId}|v:${e.sourceVariantId ?? ""}`,
        { name: e.nameBg || e.nameEn, quantity: pieces, size: null, note: null, totalPriceEur: 0 },
        price
      );
    }

    const categoryLabel = categoryLabelOf(item);
    const groupKey = item.categoryId ?? "__none__";
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        categoryId: item.categoryId ?? null,
        categoryLabel,
        lines: [],
        rank: categoryRank(item),
        first: index,
      };
      groups.set(groupKey, group);
    }
    group.lines.push({
      label: categoryLabel ? `${categoryLabel}: ${item.productNameBg}` : item.productNameBg,
      categoryLabel,
      name: item.productNameBg,
      quantity: qty,
      size: item.variantName ? item.variantName.split(" / ")[0] : null,
      extras: all.filter((e) => e.type !== "sauce"),
      note: item.itemNote?.trim() || null,
      totalPriceEur: (cents(item.totalPriceEur) - sauceCents) / 100,
    });
  });

  const orderedGroups = [...groups.values()]
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.first - b.first)
    .map(({ categoryId, categoryLabel, lines }) => ({ categoryId, categoryLabel, lines }));

  const orderedSauces = [...sauces.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ label, name, quantity, size, note, totalPriceEur }) => ({
      label,
      name,
      quantity,
      size,
      note,
      totalPriceEur,
    }));

  return { groups: orderedGroups, sauces: orderedSauces };
}

/** The model's lines flattened in print order (dishes, then sauces). */
export function ticketLinesInOrder(model: TicketModel): (TicketDishLine | TicketSauceLine)[] {
  return [...model.groups.flatMap((g) => g.lines), ...model.sauces];
}
