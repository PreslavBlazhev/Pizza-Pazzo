# Admin Menu Management — DB Migration Plan

**Статус: ПЛАН (нарочно не е имплементиран).** Решението от
production-readiness цикъла на 18.07.2026: миграцията е най-голямото
оставащо парче (~2–3 работни дни) и се прави като САМОСТОЯТЕЛНА задача,
не между другото — половин миграция е по-лоша от никаква.

## Решение: Вариант B — DB-backed меню (SQLite/Prisma)

Вариант A (админ редактира JSON файла) отпада за production: на Render
файловата система на кода е ефимерна — всеки deploy/restart връща JSON-а
от git и изтрива редакциите на админа. JSON editor е удобен само локално.

Вариант B е правилният: продуктите отиват в същата SQLite база на
Persistent Disk-а, където вече живеят поръчките.

## Защо НЕ е тривиално (какво реално се променя)

1. **Static → runtime рендериране.** Днес 268 страници се генерират при
   build от JSON-а. При DB меню Render НЯМА достъп до диска по build
   време → продуктовите/менюто страници стават динамични.
   Стратегия: `export const revalidate = 300` (ISR) + `revalidateTag`
   от админ-save действията, за да се обнови менюто веднага след
   редакция. SEO не страда (SSR html), скоростта също (кеширано).
2. **`lib/menu-data.ts` става async.** Архитектурата е строена точно за
   този шев — само този файл чете данни — но всичките му извиквания
   в server components стават `await`, а klient-side търсенето в менюто
   получава данните като props (както днес).
3. **Checkout** чете цените през същия шев → сменя се на DB четене на
   едно място (`app/actions/checkout.ts` ползва `getProducts`), без
   промяна на логиката за преизчисляване.
4. **Sitemap** също минава на runtime данни.

## Prisma модели (добавят се към schema.prisma)

```prisma
model MenuCategory {
  id        String        @id            // запазваме cat_* id-тата
  slug      String        @unique
  nameBg    String
  nameEn    String
  sortOrder Int           @default(0)
  isActive  Boolean       @default(true)
  products  MenuProduct[]
}

model MenuProduct {
  id            String        @id        // запазваме prod_* id-тата
  slug          String        @unique    // запазваме slug-овете (SEO!)
  nameBg        String
  nameEn        String
  descriptionBg String        @default("")
  descriptionEn String        @default("")
  categoryId    String
  category      MenuCategory  @relation(fields: [categoryId], references: [id])
  priceBgn      Decimal
  priceEur      Decimal
  imageUrl      String?
  allergens     String        @default("[]") // JSON масив (SQLite няма arrays)
  sizeBg        String?
  sizeEn        String?
  isAvailable   Boolean       @default(true)
  isPopular     Boolean       @default(false)
  isNew         Boolean       @default(false)
  sortOrder     Int           @default(0)
  variants      MenuVariant[]
}

model MenuVariant {
  id        String      @id              // запазваме var_* id-тата
  productId String
  product   MenuProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  nameBg    String
  nameEn    String
  priceBgn  Decimal
  priceEur  Decimal
  sortOrder Int         @default(0)
}
```

Забележки: пари = Decimal (както Order); id-тата от JSON-а се запазват,
за да останат валидни OrderItem.productId/variantId на старите поръчки.

## Import

`scripts/import-menu-to-db.mjs` — чете `data/pizza-pazzo-menu.json` +
`data/categories.json`, upsert по id (идемпотентен). JSON-ът ОСТАВА в
repo-то като seed/backup; след миграцията истината е базата, а скриптът
се пуска еднократно на Render (Shell) и при нужда от reset.
Проверка след import: 10 категории, 98 продукта, 42 с варианти,
`npm run smoke` адаптиран да чете от DB.

## Admin CRUD (MVP обхват)

- `/admin/products`: списък с търсене + филтър по категория; редакция на
  BG/EN име и описание, категория, цени EUR/BGN (и по вариант),
  наличност, популярен, imageUrl (текстово поле, напр.
  `/images/products/margarita.jpg`), алергени (checkbox-и от
  `lib/allergens.ts`). Server actions + zod, guard: STAFF+ (цени/изтриване
  — ADMIN+).
- `/admin/categories`: BG/EN име, sortOrder, active. Slug НЕ се редактира
  в MVP (SEO риск).
- Availability: недостъпен продукт → „Временно недостъпно" в менюто,
  без AddToCart, checkout вече отказва server-side (`!p.isAvailable`).
- НЕ в MVP: upload на снимки (нужен е storage), drag&drop, bulk edit,
  създаване/триене на продукти (v2 — първо редакция на съществуващите).

## Ред на изпълнение (когато се захване)

1. Модели + migration + import скрипт; проверка на данните.
2. `lib/menu-data.ts` → async DB четене; страниците на ISR; build зелен
   ЛОКАЛНО с dev.db.
3. Checkout през DB; smoke тестът срещу DB; тестова поръчка E2E.
4. Admin products редакция (най-често нужното: цена/наличност) → останалите полета.
5. Admin categories.
6. `revalidateTag` при save; проверка че публичното меню се обновява.

Всяка стъпка приключва със зелени tsc/build/smoke — ако стъпка 2 или 3
се провали, revert е тривиален, защото JSON пътят още не е изтрит.

Свързани документи: `docs/admin-panel-plan.md`, `docs/database-plan.md`,
`docs/system-roadmap.md` (Етап 5).
