/**
 * Writes the review artefacts for the 2026-10-17 changes (synthetic data):
 *   - tickets: the sample order as KITCHEN and DELIVERY slips at 32/42/48
 *     characters, first print and reprint (plain text = what the thermal
 *     printer gets);
 *   - the "accepted" e-mail, HTML and plain text, delivery and pickup;
 *   - combo price examples computed by the real lib/pizza-math.ts from the
 *     seed menu (data/pizza-pazzo-menu.json) under the final rule, and the
 *     list of standard pairs that do NOT get the package (regular ≤ package).
 *
 *   npx tsx scripts/render-evidence.ts [outDir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildTicketText } from "@/lib/printer/ticket-template";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { COMBO_PRICING_MODE, PIZZA_COMBO_CATEGORY_IDS, pizzaMathDiscount, type PizzaMathLine } from "@/lib/pizza-math";
import { buildPrintableOrderJson } from "@/lib/android-printer";
import { defaultPrintTemplate } from "@/types/print";

const out = process.argv[2] ?? "docs/evidence-2026-10-17";
mkdirSync(out, { recursive: true });

// ── Tickets ──
for (const id of ["KITCHEN", "DELIVERY"] as const) {
  for (const width of [32, 42, 48]) {
    const t = { ...defaultPrintTemplate(id), charsPerLine: width };
    const body = [
      `=== ${id} @ ${width} chars — first print ===`,
      buildTicketText(SAMPLE_PRINT_ORDER, t),
      "",
      `=== ${id} @ ${width} chars — reprint ===`,
      buildTicketText(SAMPLE_PRINT_ORDER, t, { isReprint: true }),
    ].join("\n");
    writeFileSync(path.join(out, `ticket-${id.toLowerCase()}-${width}.txt`), `${body}\n`);
  }
}
writeFileSync(
  path.join(out, "android-print-job.json"),
  JSON.stringify(
    JSON.parse(
      buildPrintableOrderJson(
        { ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items! },
        { template: defaultPrintTemplate("KITCHEN") }
      )
    ),
    null,
    2
  )
);

// ── E-mail ──
const order = { ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items! };
const contact = { phone: "064 801 999", trackingUrl: "https://pizzapazzo.bg/track#t=EXAMPLE-TOKEN" };
for (const [name, o] of [
  ["delivery", order],
  ["pickup", { ...order, deliveryMethod: "PICKUP" as const }],
] as const) {
  const mail = customerOrderAcceptedEmail(o, contact);
  writeFileSync(
    path.join(out, `email-accepted-${name}.html`),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${mail.subject}</title>${mail.html}`
  );
  writeFileSync(path.join(out, `email-accepted-${name}.txt`), `Subject: ${mail.subject}\n\n${mail.text}\n`);
}

// ── Prices (the FINAL rule: never_dearer, standard pizzas only) ──
type RawProduct = {
  id: string;
  name: { bg: string };
  categoryId: string;
  variants?: { name: { bg: string }; priceEur: number }[];
};
const menu = JSON.parse(readFileSync("data/pizza-pazzo-menu.json", "utf8")) as RawProduct[];
const pizzas = menu.filter((p) => p.categoryId === "cat_pizzas_standard" || p.categoryId === "cat_pizzas_special");
const priceOf = (id: string, size: 30 | 40) =>
  pizzas.find((p) => p.id === id)!.variants!.find((v) => v.name.bg.startsWith(String(size)))!.priceEur;
const nameOf = (id: string) => pizzas.find((p) => p.id === id)!.name.bg;
const line = (id: string, size: 30 | 40, quantity = 1): PizzaMathLine => ({
  key: `${id}-${size}`,
  categoryId: pizzas.find((p) => p.id === id)!.categoryId,
  variantName: `${size} см`,
  baseUnitEur: priceOf(id, size),
  quantity,
});
const eur = (n: number) => `${n.toFixed(2)} €`;

const scenarios: { title: string; lines: PizzaMathLine[]; extrasEur?: number; note?: string; why?: string }[] = [
  { title: "Пеперони Макс 30 + Хавайска 30", lines: [line("prod_peperoni_maks", 30), line("prod_havayska", 30)] },
  { title: "Пеперони Макс 40 + Хавайска 30", lines: [line("prod_peperoni_maks", 40), line("prod_havayska", 30)] },
  { title: "Пеперони Макс 40 + Цезар 40", lines: [line("prod_peperoni_maks", 40), line("prod_tsezar", 40)] },
  { title: "2 × Пеперони Макс 30 (един ред, qty 2)", lines: [line("prod_peperoni_maks", 30, 2)] },
  {
    title: "Маргарита 30 + Кашкавалина 40 (примерът от заданието)",
    lines: [line("prod_margarita", 30), line("prod_kashkavalina", 40)],
    why: "16.88 < 19.43 — редовна цена",
  },
  {
    title: "Маргарита 30 + Кашкавалина 30",
    lines: [line("prod_margarita", 30), line("prod_kashkavalina", 30)],
    why: "13.30 < 16.87 — редовна цена",
  },
  {
    title: "Маргарита 40 + Кашкавалина 40",
    lines: [line("prod_margarita", 40), line("prod_kashkavalina", 40)],
    why: "20.46 < 23.01 — редовна цена",
  },
  {
    title: "Маргарита 30 + Пеперони Макс 40",
    lines: [line("prod_margarita", 30), line("prod_peperoni_maks", 40)],
    why: "19.43 = 19.43 — равно, без пакет",
  },
  {
    title: "Маргарита 40 + Пеперони Макс 30",
    lines: [line("prod_margarita", 40), line("prod_peperoni_maks", 30)],
    why: "19.94 > 19.43",
  },
  {
    title: "Сьомга 40 + Прошуто 30 (две специални)",
    lines: [line("prod_syomga", 40), line("prod_proshuto", 30)],
    why: "специалните не участват",
  },
  {
    title: "Сьомга 30 (специална) + Пеперони Макс 30",
    lines: [line("prod_syomga", 30), line("prod_peperoni_maks", 30)],
    why: "специална + обикновена не прави пакет",
  },
  {
    title: "2 × Пеперони Макс 30 + Сьомга 40 + Прошуто 30",
    lines: [line("prod_peperoni_maks", 30, 2), line("prod_syomga", 40), line("prod_proshuto", 30)],
    why: "обикновените получават пакет, специалните плащат редовно",
  },
  {
    title: "3 пици: Пеперони 40 + Хавайска 30 + Маргарита 30",
    lines: [line("prod_peperoni_maks", 40), line("prod_havayska", 30), line("prod_margarita", 30)],
  },
  { title: "4 пици: 2 × Пеперони 30 + 2 × Цезар 40", lines: [line("prod_peperoni_maks", 30, 2), line("prod_tsezar", 40, 2)] },
  {
    title: "4 пици: 2 × Маргарита 30 + 2 × Пеперони 30",
    lines: [line("prod_margarita", 30, 2), line("prod_peperoni_maks", 30, 2)],
    why: "само двойката, която спестява; Маргаритите не се сдвояват",
  },
  { title: "5 пици: 3 × Пеперони 30 + 2 × Цезар 40", lines: [line("prod_peperoni_maks", 30, 3), line("prod_tsezar", 40, 2)] },
  {
    title: "Пеперони 40 + Хавайска 30 + кашкавален борд 40 (4.60) + 2 × Чеснов сос (2.04)",
    lines: [line("prod_peperoni_maks", 40), line("prod_havayska", 30)],
    extrasEur: 6.64,
    note: "извън пакета",
  },
  {
    title: "Маргарита 30 + Кашкавалина 30, всяка с месна добавка (2 × 2.56)",
    lines: [line("prod_margarita", 30), line("prod_kashkavalina", 30)],
    extrasEur: 5.12,
    note: "не се броят към пакета",
    why: "основите 13.30 < 16.87; с добавките 18.42, но добавките не се броят",
  },
];

const rows: string[] = [
  "| Поръчка | Редовни основи | Приложен пакет | Добавки | Доставка | **Крайно** | Бележка |",
  "|---|---|---|---|---|---|---|",
];
for (const s of scenarios) {
  const regular = s.lines.reduce((t, l) => t + Math.round(l.baseUnitEur * 100) * l.quantity, 0) / 100;
  const r = pizzaMathDiscount(s.lines);
  const extras = s.extrasEur ?? 0;
  const pairs = r.pairs.length
    ? r.pairs.map((p) => `${p.sizes} → ${eur(p.comboEur)} (редовно ${eur(p.regularEur)})`).join("; ")
    : "— (без пакет)";
  const total = Math.round((regular - r.discountEur + extras) * 100) / 100;
  const diff = r.discountEur > 0 ? ` (отстъпка ${eur(r.discountEur)})` : "";
  rows.push(
    `| ${s.title} | ${eur(regular)} | ${pairs} | ${extras ? `${eur(extras)} (${s.note})` : "—"} | 0.00 € | **${eur(
      total
    )}**${diff} | ${s.why ?? ""} |`
  );
}

// Every distinct pair of STANDARD pizzas (by size and price) that does NOT get
// the package, because its regular price is not strictly above it.
const standard = pizzas.filter((p) => PIZZA_COMBO_CATEGORY_IDS.includes(p.categoryId));
const noOffer: string[] = ["| Двойка (стандартни, пример) | Редовно | Пакет | Резултат |", "|---|---|---|---|"];
const seen = new Set<string>();
for (const a of standard) {
  for (const b of standard) {
    for (const [sa, sb] of [
      [30, 30],
      [30, 40],
      [40, 40],
    ] as const) {
      const pa = priceOf(a.id, sa);
      const pb = priceOf(b.id, sb);
      const key = sa === sb ? `${sa}:${Math.min(pa, pb)}|${sb}:${Math.max(pa, pb)}` : `${sa}:${pa}|${sb}:${pb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const combo = ({ "30+30": 16.87, "30+40": 19.43, "40+40": 23.01 } as Record<string, number>)[`${sa}+${sb}`];
      const reg = Math.round((pa + pb) * 100) / 100;
      if (reg <= combo) {
        noOffer.push(
          `| ${nameOf(a.id)} ${sa} см (${eur(pa)}) + ${nameOf(b.id)} ${sb} см (${eur(pb)}) | ${eur(reg)} | ${eur(
            combo
          )} | ${reg === combo ? "равно" : "по-евтино"} — без пакет, плаща ${eur(reg)} |`
        );
      }
    }
  }
}
const specials = pizzas.filter((p) => !PIZZA_COMBO_CATEGORY_IDS.includes(p.categoryId)).map((p) => p.name.bg);
const doc = [
  "# Ценови примери — окончателно правило",
  "",
  `Активен режим: \`${COMBO_PRICING_MODE}\`; участващи категории: ${PIZZA_COMBO_CATEGORY_IDS.join(", ")}.`,
  `Изчислено от \`data/pizza-pazzo-menu.json\` (seed; съвпада с публичните цени, виж live-price-check.txt) с реалния \`lib/pizza-math.ts\`.`,
  `Изключени специални пици (cat_pizzas_special): ${specials.join(", ")}.`,
  "",
  rows.join("\n"),
  "",
  "### Стандартни двойки, които НЕ получават пакет (редовната цена не е строго над пакетната)",
  "",
  "По една двойка за всяка комбинация от размер и цена.",
  "",
  noOffer.join("\n"),
  "",
].join("\n");
writeFileSync(path.join(out, "price-examples.md"), doc);
console.log(doc);
