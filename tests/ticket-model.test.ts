/**
 * C. Tickets: grouped by category (pizzas first, sauces last), "Категория:
 * Име" on every line, sauces summed in their own section — on the web ticket,
 * the admin preview, reprints and the Android print job alike.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTicketModel } from "@/lib/printer/ticket-model";
import { buildTicket, buildTicketText } from "@/lib/printer/ticket-template";
import { buildPrintableOrderJson } from "@/lib/android-printer";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import { defaultPrintTemplate, type PrintTemplateData } from "@/types/print";
import type { Order, OrderItem } from "@/types/order";
import type { OrderItemExtra } from "@/lib/extras-rules";

const sauce = (id: string, name: string, quantity: number): OrderItemExtra => ({
  key: `sauce:${id}`,
  sourceProductId: id,
  type: "sauce",
  nameBg: name,
  nameEn: name,
  quantity,
  unitPriceEur: 1.02,
  totalPriceEur: Math.round(1.02 * quantity * 100) / 100,
});
const crust: OrderItemExtra = {
  key: "cheese_crust",
  sourceProductId: "prod_bord",
  sourceVariantId: "var_bord_40",
  type: "pizza_crust",
  nameBg: "Кашкавален борд",
  nameEn: "Cheese crust",
  quantity: 1,
  sizeContext: "40 см",
  unitPriceEur: 4.6,
  totalPriceEur: 4.6,
};

let n = 0;
function item(p: Partial<OrderItem>): OrderItem {
  n++;
  return {
    id: `i${n}`,
    orderId: "o",
    productId: `prod_${n}`,
    productSlug: null,
    productNameBg: `Продукт ${n}`,
    productNameEn: null,
    productImageUrl: null,
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPriceEur: 5,
    totalPriceEur: 5,
    extras: [],
    discountEur: 0,
    categoryId: null,
    categoryNameBg: null,
    categoryNameEn: null,
    categorySortOrder: null,
    itemNote: null,
    ...p,
  };
}
const pizzaCat = { categoryId: "cat_pizzas_standard", categoryNameBg: "Стандартни пици", categorySortOrder: 1 };
const burgerCat = { categoryId: "cat_burgers", categoryNameBg: "Бургери", categorySortOrder: 5 };
const sauceCat = { categoryId: "cat_sauces", categoryNameBg: "Сосове", categorySortOrder: 8 };
const order = (items: OrderItem[], extra: Partial<Order> = {}): Order => ({
  ...SAMPLE_PRINT_ORDER,
  items,
  offer: [],
  discountEur: 0,
  subtotalEur: items.reduce((s, i) => s + i.totalPriceEur, 0),
  totalEur: items.reduce((s, i) => s + i.totalPriceEur, 0),
  ...extra,
});

test("a mixed-up order prints pizzas first, then the menu's order, sauces last — never pizza/burger/pizza", () => {
  const o = order([
    item({ productNameBg: "Пилешки", ...burgerCat }),
    item({ productNameBg: "Маргарита", variantName: "40 см / 40 cm", ...pizzaCat }),
    item({ productNameBg: "Чеснов сос", ...sauceCat }),
    item({ productNameBg: "Пеперони", variantName: "30 см / 30 cm", ...pizzaCat }),
    item({ productNameBg: "Сьомга", categoryId: "cat_pizzas_special", categoryNameBg: "Специални пици", categorySortOrder: 2 }),
  ]);
  const model = buildTicketModel(o);
  const labels = model.groups.flatMap((g) => g.lines.map((l) => l.label));
  assert.deepEqual(labels, ["Пица: Маргарита", "Пица: Пеперони", "Специална пица: Сьомга", "Бургер: Пилешки"]);
  assert.deepEqual(model.sauces.map((s) => s.label), ["Сосове: Чеснов сос"]);
  const text = buildTicketText(o, defaultPrintTemplate("DELIVERY"));
  const idx = (s: string) => text.indexOf(s);
  assert.ok(idx("Пица: Маргарита") < idx("Пица: Пеперони"));
  assert.ok(idx("Пица: Пеперони") < idx("Бургер: Пилешки"));
  assert.ok(idx("Бургер: Пилешки") < idx("Сосове:"));
  assert.ok(text.includes("Размер: 40 см") && !text.includes("40 cm"));
});

test("the same pizza with different modifications or notes stays two lines", () => {
  const o = order([
    item({ productId: "prod_m", productNameBg: "Маргарита", variantName: "40 см", extras: [crust], ...pizzaCat }),
    item({ productId: "prod_m", productNameBg: "Маргарита", variantName: "40 см", itemNote: "Без кашкавал", ...pizzaCat }),
  ]);
  const lines = buildTicketModel(o).groups[0].lines;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].extras[0].name, "Кашкавален борд");
  assert.equal(lines[1].note, "Без кашкавал");
});

test("sauces: 2 pizzas × 2 garlic + 1 garlic on its own = 5, printed once, priced once", () => {
  const o = order([
    item({ productNameBg: "Маргарита", quantity: 2, totalPriceEur: 33.74, extras: [crust, sauce("prod_garlic", "Чеснов сос", 2)], ...pizzaCat }),
    item({ productId: "prod_garlic", productNameBg: "Чеснов сос", totalPriceEur: 1.02, ...sauceCat }),
    item({ productNameBg: "Пилешки", totalPriceEur: 8.69, extras: [sauce("prod_ketchup", "Кетчуп", 1)], ...burgerCat }),
  ]);
  const model = buildTicketModel(o);
  assert.deepEqual(
    model.sauces.map((s) => [s.label, s.quantity, s.totalPriceEur]),
    [
      ["Сосове: Чеснов сос", 5, 5.1],
      ["Сосове: Кетчуп", 1, 1.02],
    ]
  );
  const dish = model.groups[0].lines[0];
  assert.equal(dish.extras.length, 1, "the crust stays under the pizza, the sauce does not");
  assert.equal(dish.totalPriceEur, 29.66, "33.74 − 4 × 1.02");
  const all = [...model.groups.flatMap((g) => g.lines), ...model.sauces];
  const sum = all.reduce((s, l) => s + Math.round(l.totalPriceEur * 100), 0);
  assert.equal(sum, Math.round((33.74 + 1.02 + 8.69) * 100), "nothing charged twice, nothing lost");
  const text = buildTicketText(o, defaultPrintTemplate("DELIVERY"));
  assert.equal(text.split("Чеснов сос").length - 1, 1, "garlic sauce appears exactly once");
  assert.match(text, /Сосове:\n5 x Сосове: Чеснов сос/);
});

test("a sauce ordered on its own WITH a note keeps its own row and the note", () => {
  const o = order([
    item({ productId: "prod_garlic", productNameBg: "Чеснов сос", itemNote: "отделно, в торбичка", ...sauceCat }),
    item({ productNameBg: "Пеперони", extras: [sauce("prod_garlic", "Чеснов сос", 1)], ...pizzaCat }),
  ]);
  const rows = buildTicketModel(o).sauces;
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.note === "отделно, в торбичка" && r.quantity === 1));
});

test("old or incomplete lines (no category, broken extras) print by name and never crash", () => {
  const o = order([
    item({ productNameBg: "Стара пица", variantName: "30 см" }),
    item({ productNameBg: "Нещо", extras: [{ broken: true } as unknown as OrderItemExtra] }),
    item({ productNameBg: "Маргарита", ...pizzaCat }),
  ]);
  const text = buildTicketText(o, defaultPrintTemplate("KITCHEN"));
  assert.ok(text.includes("СТАРА") || text.includes("Стара пица"));
  const model = buildTicketModel(o);
  assert.equal(model.groups[0].lines[0].label, "Пица: Маргарита", "categorised lines come first");
  assert.equal(model.groups[1].lines[0].label, "Стара пица", "no category is invented");
});

test("Cyrillic and long names wrap inside the paper at 32, 42 and 48 characters; nothing is cut", () => {
  const longName = "Чинкуе Пашони със сушени домати, рукола и двойна моцарела";
  const o = order([
    item({ productNameBg: longName, quantity: 2, extras: [crust], itemNote: "Много дълга бележка за кухнята — нарежете на осем парчета", ...pizzaCat }),
    item({ productNameBg: "Чеснов сос", ...sauceCat }),
  ]);
  for (const width of [32, 42, 48]) {
    for (const id of ["KITCHEN", "DELIVERY"] as const) {
      const base = defaultPrintTemplate(id);
      const template: PrintTemplateData = { ...base, charsPerLine: width };
      const lines = buildTicket(o, template);
      for (const l of lines) {
        const cols = Math.floor(width / l.scale);
        const shown = l.right ? `${l.text} ${l.right}` : l.text;
        assert.ok(shown.length <= cols, `${id}@${width}: "${shown}" (${shown.length} > ${cols})`);
      }
      const flat = lines.map((l) => l.text).join(" ").replace(/\s+/g, "");
      assert.ok(flat.includes(`Пица:${longName}`.replace(/\s+/g, "")), `${id}@${width} keeps the whole name`);
    }
  }
});

test("preview, real print and reprint come from the same model; the Android job matches it", () => {
  const t = defaultPrintTemplate("DELIVERY");
  const first = buildTicketText(SAMPLE_PRINT_ORDER, t);
  const reprint = buildTicketText(SAMPLE_PRINT_ORDER, t, { isReprint: true });
  assert.ok(!first.includes("ПОВТОРЕН ПЕЧАТ"));
  assert.ok(reprint.includes("ПОВТОРЕН ПЕЧАТ"));
  assert.equal(reprint.replace(/.*ПОВТОРЕН ПЕЧАТ.*\n/, ""), first, "a reprint is the same ticket plus the marker");

  const job = JSON.parse(buildPrintableOrderJson({ ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items! }, { template: t, isReprint: true }));
  const model = buildTicketModel(SAMPLE_PRINT_ORDER);
  const expected = [
    ...model.groups.flatMap((g) => g.lines.map((l) => [l.label, l.quantity])),
    ...model.sauces.map((s) => [s.label, s.quantity]),
  ];
  assert.deepEqual(job.items.map((i: { name: string; quantity: number }) => [i.name, i.quantity]), expected);
  assert.equal(job.isReprint, true);
  const jobSum = job.items.reduce((s: number, i: { totalPrice: number }) => s + Math.round(i.totalPrice * 100), 0);
  assert.equal(jobSum, Math.round(SAMPLE_PRINT_ORDER.subtotalEur * 100), "the job's lines add up to the order");
  // The sample is representative: mixed lines, sauces from extras + on their own.
  assert.equal(job.items.at(-1).name, "Сосове: Чеснов сос");
  assert.equal(job.items.at(-1).quantity, 5);
});

test("a pickup order prints 'ВЗЕМАНЕ ОТ МЯСТО' and no address", () => {
  const o = order([item({ productNameBg: "Маргарита", ...pizzaCat })], { deliveryMethod: "PICKUP" });
  const text = buildTicketText(o, defaultPrintTemplate("DELIVERY"));
  assert.ok(text.includes("ВЗЕМАНЕ ОТ МЯСТО"));
  assert.ok(!text.includes(SAMPLE_PRINT_ORDER.deliveryAddress.split(",")[0]));
});
