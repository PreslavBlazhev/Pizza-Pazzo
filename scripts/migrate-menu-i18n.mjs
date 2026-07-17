/**
 * One-off migration: flat Bulgarian strings → { bg, en } in the menu data.
 *
 * Before: { "name": "Маргарита", "description": "доматен сос и кашкавал" }
 * After:  { "name": { "bg": "Маргарита", "en": "Margherita" }, ... }
 *
 * The English text is authored here rather than generated, because food names
 * are judgement calls: coined brand names (Kashkavalina, Tribagra, Cinque
 * Pazzoni) are transliterated so they stay recognisable on the receipt and over
 * the phone, while descriptive names (Див Запад → Wild West) are translated.
 *
 * !! The client must review the English names before publishing. !!
 *
 * Re-runnable: already-migrated files are detected and skipped, so this is safe
 * to run again if the source .docx is re-imported.
 *
 * Run: node scripts/migrate-menu-i18n.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** id → English name/description. Bulgarian is taken from the existing file. */
const PRODUCTS_EN = {
  // ── Standard pizzas ──
  prod_margarita: ["Margherita", "tomato sauce and kashkaval cheese"],
  prod_kashkavalina: ["Kashkavalina", "garlic base and kashkaval cheese"],
  prod_margarita_de_luks: ["Margherita de Luxe", "tomato sauce, kashkaval cheese, cherry tomatoes, rocket, sun-dried tomatoes and Grana Padano"],
  prod_brusketitsa: ["Bruschettina", "Margherita topped with fresh basil, tomatoes and red onion"],
  prod_tribagra: ["Tribagra", "tomato sauce, kashkaval cheese, cherry tomatoes, mozzarella and fresh basil"],
  prod_shopska: ["Shopska", "tomato sauce, kashkaval cheese, green and red peppers, white cheese, tomatoes and parsley"],
  prod_balkanska: ["Balkan", "tomato sauce, kashkaval cheese, mushrooms, olives, red peppers, tomatoes and basil"],
  prod_vege: ["Veggie", "tomato sauce, kashkaval cheese, green and red peppers and red onion"],
  prod_vege_vulkano: ["Veggie Vulcano", "tomato sauce, kashkaval cheese, green and red peppers, red onion and jalapeño"],
  prod_staroselska: ["Old Village", "tomato sauce, kashkaval cheese, red and green peppers, garlic and parsley"],
  prod_chinkue_patsoni: ["Cinque Pazzoni", "tomato sauce, kashkaval cheese, white cheese, Gouda, mozzarella, Emmental"],
  prod_selska: ["Village", "tomato sauce, kashkaval cheese, pork ham and mushrooms"],
  prod_havayska: ["Hawaiian", "tomato sauce, kashkaval cheese, pork ham and pineapple pieces"],
  prod_peperoni_maks: ["Pepperoni Max", "red onion and a double layer of pepperoni"],
  prod_div_zapad: ["Wild West", "tomato sauce, kashkaval cheese, grilled chicken, tavern sausage and bacon"],
  prod_chika_latina: ["Chica Latina", "guacamole sauce, kashkaval cheese, smoked bacon and grilled chicken"],
  prod_tsezar: ["Caesar", "cream base, chicken fillet, Parmesan, Caesar sauce, rocket"],
  prod_karbonara: ["Carbonara", "Hollandaise sauce, kashkaval cheese, mushrooms, smoked bacon and chicken fillet"],
  prod_angliyska_zakuska: ["English Breakfast", "tomato sauce, kashkaval cheese, mushrooms, smoked bacon and egg"],
  prod_amerikanski_burger: ["American Burger", "tomato sauce, kashkaval cheese, pickles, beef patty and smoked bacon"],
  prod_nyu_york_hot_dog: ["New York Hot Dog", "honey mustard base, red onion and frankfurter"],
  prod_teksasko_bbq: ["Texas BBQ", "tomato sauce, kashkaval cheese, red onion, chicken ham, smoked bacon and BBQ sauce"],
  prod_meksiko: ["Mexico", "tomato sauce, kashkaval cheese, red onion, red pepper, spicy beef and jalapeño"],
  prod_mestna_mesna: ["Local Meat", "tomato sauce, kashkaval cheese, red onion, deli salami, pepperoni and lukanka"],
  prod_vulkano: ["Vulcano", "tomato sauce, kashkaval cheese, ground dried chilli, pepperoni and jalapeño"],
  prod_printsesa: ["Princess", "tomato sauce, kashkaval cheese, white cheese, lukanka and egg"],
  prod_pile: ["Chicken", "tomato sauce, kashkaval cheese, sweet corn, chicken ham and BBQ sauce"],
  prod_indiysko_pile: ["Indian Chicken", "tomato sauce, kashkaval cheese, sweet corn, chicken fillet with Indian spices"],
  prod_rancho: ["Ranch", "tomato sauce, kashkaval cheese, pickles, processed cheese and chicken ham"],
  prod_byalo_pile: ["White Chicken", "garlic base, kashkaval cheese, mushrooms and chicken ham"],
  prod_nikulden: ["St Nicholas", "tomato sauce, kashkaval cheese, crab sticks, tuna and anchovies"],
  prod_okeana: ["Oceana", "tomato sauce, kashkaval cheese, red onion, olives, tuna, fresh basil and sun-dried tomatoes"],
  prod_moyata_patso: ["My Pazzo", "Margherita with three toppings of your choice"],
  prod_spetsialna: ["Special", "tomato sauce, kashkaval cheese, pepperoni, grilled chicken, spicy beef, green peppers, onion"],

  // ── Special pizzas ──
  prod_syomga: ["Salmon", "Philadelphia base and smoked salmon"],
  prod_proshuto: ["Prosciutto", "tomato sauce, kashkaval cheese, rocket, cherry tomatoes, prosciutto crudo, Grana Padano"],

  // ── Pizza add-ons ──
  prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord: ["Kashkaval / Philadelphia / Frankfurter / Pepperoni crust", "stuffed crust filling"],
  prod_mesni_mlechni_ribni: ["Meat / dairy / fish", "pizza toppings"],
  prod_zelenchukovi: ["Vegetable", "pizza toppings"],

  // ── Starters ──
  prod_presni_hlebni_topcheta: ["Fresh bread bites", "made from pizza dough, with garlic sauce"],
  prod_chesnova_bageta: ["Garlic baguette", ""],
  prod_chesnova_bageta_s_kashkaval: ["Garlic baguette with kashkaval cheese", ""],
  prod_lucheni_kragcheta: ["Onion rings", "with garlic sauce"],
  prod_parzheni_kartofi: ["French fries", ""],
  prod_parzheni_kartofi_sas_sirene: ["French fries with cheese", ""],
  prod_proletni_rultsa: ["Spring rolls", "with vegetables, served with sweet chilli"],
  prod_proletni_rultsa_s_pile: ["Spring rolls with chicken", "served with sweet chilli"],
  prod_kartofeni_rezanki: ["Potato wedges", "with BBQ sauce"],
  prod_panirani_kalmari: ["Breaded calamari", "served with creamy garlic sauce"],
  prod_pileshki_hapki: ["Chicken bites", "roast chicken seasoned with honey mustard"],
  prod_kari_pileshki_hapki: ["Curry chicken bites", "roast chicken seasoned with curry sauce"],
  prod_hrupkavi_pileshki_bonfilentsa: ["Crispy chicken tenders", "with creamy garlic sauce"],
  prod_hrupkavi_spanacheni_kyufteta: ["Crispy spinach balls", "with creamy garlic sauce"],
  prod_motsareleni_prachitsi: ["Mozzarella sticks", "with tomato sauce"],
  prod_panirani_kashkavalcheta: ["Breaded kashkaval bites", "with blueberry sauce"],
  prod_panirani_sirentsa: ["Breaded white cheese bites", "with blueberry sauce"],
  prod_mamini_kyuftentsa: ["Mum's meatballs", "100% pork"],
  prod_pikantni_kartofi: ["Spicy potatoes", ""],
  prod_pikantni_kartofi_2: ["Spicy potatoes", ""],

  // ── Burgers ──
  prod_pileshki: ["Chicken", "chicken patty, cheddar, pickles, onion, iceberg lettuce, BBQ sauce, mayonnaise"],
  prod_hrupkavo_pile: ["Crispy Chicken", "chicken tenderloin, cheddar, spinach, honey mustard, tomato, pickles and ketchup"],
  prod_vege_2: ["Veggie", "2 potato patties, cheddar, iceberg lettuce, onion, mayonnaise, pickles, ketchup"],
  prod_teleshki: ["Beef", "beef patty, cheddar, bacon, onion, pickles, tomato, iceberg lettuce"],
  prod_syomga_2: ["Salmon", "Philadelphia, salmon patty, cucumber, dill, lemon dressing, iceberg lettuce"],
  prod_rastitelen: ["Plant-based", "burger sauce, iceberg lettuce, onion, pickles, bacon, cheddar"],
  prod_yaytse_i_bekon: ["Egg and Bacon", "mayonnaise, double egg, pickles, iceberg lettuce, bacon, cheddar"],

  // ── Burger add-ons ──
  prod_yaytse_pecheno: ["Fried egg", ""],
  prod_hrupkavo_pile_2: ["Crispy chicken", ""],
  prod_pileshko_teleshko_kyufte: ["Chicken / beef patty", ""],
  prod_chedar: ["Cheddar", ""],
  prod_bekon_shunka: ["Bacon / ham", ""],
  prod_zelenchukova: ["Vegetable", ""],

  // ── Salads ──
  prod_shopska_2: ["Shopska", "tomatoes, cucumbers, green peppers, red onion, roasted red peppers, white cheese, parsley"],
  prod_ovcharska: ["Shepherd's", "cucumber, tomato, roasted pepper, onion, white cheese, kashkaval cheese, pork ham, olives"],
  prod_tsezar_2: ["Caesar", "iceberg lettuce, cherry tomatoes, croutons, fried chicken tenderloin, Parmesan and Caesar dressing"],
  prod_riba_ton: ["Tuna", "iceberg lettuce, cucumbers, sweet corn, tuna, lemon, honey mustard"],
  prod_tribagra_2: ["Tribagra", "tomato slices, pesto genovese, white cheese, fresh basil leaves"],

  // ── Sauces ──
  prod_medena_gorchitsa: ["Honey mustard", "70 ml sauce"],
  prod_chesnov_sos: ["Garlic sauce", "70 ml sauce"],
  prod_sos_samuray: ["Samurai sauce", "70 ml sauce"],
  prod_burger_sos: ["Burger sauce", "70 ml sauce"],
  prod_sos_tsezar: ["Caesar sauce", "70 ml sauce"],
  prod_pesto_dzhenoveze: ["Pesto Genovese", "70 ml sauce"],
  prod_domaten_sos: ["Tomato sauce", "70 ml sauce"],
  prod_lyut_sos_sriracha: ["Sriracha hot sauce", "70 ml sauce"],
  prod_sladko_chili: ["Sweet chilli", "70 ml sauce"],
  prod_bbq: ["BBQ", "70 ml sauce"],
  prod_mlechno_chesnov_sos: ["Creamy garlic sauce", "70 ml sauce"],
  prod_ketchup: ["Ketchup", "70 ml sauce"],
  prod_mayoneza: ["Mayonnaise", "70 ml sauce"],
  prod_1000_ostrova: ["Thousand Island", "70 ml sauce"],
  prod_pikantna_mayoneza: ["Spicy mayonnaise", "70 ml sauce"],

  // ── Desserts ──
  prod_nutitsa: ["Nutitsa", "Nutella, walnuts, orange zest"],
  prod_new_york_style_cheesecake: ["New York Style Cheesecake", ""],
  prod_shokoladovo_brauni: ["Chocolate brownie", ""],

  // ── Drinks ──
  prod_coca_cola: ["Coca-Cola", ""],
  prod_coca_cola_2: ["Coca-Cola", ""],
  prod_mineralna_voda_bankya: ["Bankya mineral water", ""],
  prod_mineralna_voda_bankya_2: ["Bankya mineral water", ""],
  prod_stela_artoa: ["Stella Artois", "beer"],
  prod_hayneken: ["Heineken", "beer"],
};

/** id → English name/description for categories. */
const CATEGORIES_EN = {
  cat_pizzas_standard: ["Standard pizzas", "Classic wood-fired pizzas in two sizes — 30 and 40 cm."],
  cat_pizzas_special: ["Special pizzas", "Signature pizzas with premium ingredients."],
  cat_pizza_addons: ["Pizza toppings", "Extra ingredients for your pizza."],
  cat_starters: ["Starters", "Light starters and nibbles to begin."],
  cat_burgers: ["Burgers", "Juicy burgers served with fries and a drink."],
  cat_burger_addons: ["Burger extras", "Extra ingredients for your burger."],
  cat_salads: ["Salads", "Fresh seasonal salads."],
  cat_sauces: ["Sauces", "House-made sauces for your meal."],
  cat_desserts: ["Desserts", "A sweet finish to your order."],
  cat_drinks: ["Soft drinks and beer", "Soft drinks and beer."],
};

/** Sizes are formulaic ("300 г", "330 мл"), so units are mapped mechanically. */
const SIZE_OVERRIDES = {
  "с картофи 100 г, кетчуп и Coca-Cola кен 330 мл":
    "with fries 100 g, ketchup and a 330 ml can of Coca-Cola",
};

/**
 * Note on the boundaries: `\b` is ASCII-only in JavaScript, so `/г\b/` never
 * matches "300 г" — Cyrillic letters are already non-word characters to `\b`,
 * leaving no boundary to find. A negative lookahead for a Cyrillic letter is
 * what actually keeps "г" (grams) from matching inside a word.
 *
 * Order matters: "мл" is tried before "л", and "см" before "м" would be, so the
 * longer unit always wins.
 */
function translateSize(bg) {
  if (SIZE_OVERRIDES[bg]) return SIZE_OVERRIDES[bg];
  const CYR = "(?![а-яА-Я])";
  return bg
    .replace(new RegExp(`(\\d+)\\s*бр\\.?${CYR}`, "g"), (_, n) =>
      `${n} ${n === "1" ? "pc" : "pcs"}`
    )
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*см${CYR}`, "g"), "$1 cm")
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*мл\\.?${CYR}`, "g"), "$1 ml")
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*л\\.?${CYR}`, "g"), "$1 l")
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*г\\.?${CYR}`, "g"), "$1 g");
}

/** Wraps a value that is still a plain string; leaves migrated values alone. */
function localize(value, en) {
  if (value && typeof value === "object") return value; // already migrated
  return { bg: value ?? "", en: en ?? "" };
}

function migrate(file, table, isProduct) {
  const path = join(root, "data", file);
  const items = JSON.parse(readFileSync(path, "utf8"));
  let migrated = 0;
  const missing = [];

  for (const item of items) {
    if (typeof item.name === "object") continue; // idempotent
    const entry = table[item.id];
    if (!entry) {
      missing.push(`${item.id} (${item.name})`);
      continue;
    }
    const [nameEn, descEn] = entry;

    item.name = localize(item.name, nameEn);
    item.description = localize(item.description, descEn);

    if (isProduct) {
      if (item.size) item.size = localize(item.size, translateSize(item.size));
      if (Array.isArray(item.variants)) {
        for (const v of item.variants) {
          v.name = localize(v.name, translateSize(v.name));
        }
      }
    }
    migrated++;
  }

  if (missing.length) {
    console.error(`\n${file}: no English text for ${missing.length} item(s):`);
    missing.forEach((m) => console.error(`  - ${m}`));
    process.exitCode = 1;
    return;
  }

  writeFileSync(path, JSON.stringify(items, null, 2) + "\n", "utf8");
  console.log(
    `${file}: ${migrated} migrated, ${items.length - migrated} already localized (${items.length} total)`
  );
}

migrate("categories.json", CATEGORIES_EN, false);
migrate("pizza-pazzo-menu.json", PRODUCTS_EN, true);
