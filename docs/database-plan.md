# Pizza Pazzo — Database Plan

> Статус: **частично свързана.**
> - ✅ **Auth таблиците са готови** — `profiles`, `user_roles`, `user_addresses`.
>   Схемата е в `docs/supabase-auth-schema.sql`, типовете в `types/database.ts`.
> - ⏳ Менюто още идва от статичен JSON в `/data` (`lib/menu-data.ts`).
> - ⏳ Поръчките не съществуват.
>
> Целта остава: при въвеждане на базата се сменя само data-слоят, без промени в UI.

## Избор
**Supabase** (PostgreSQL + Auth + Storage). Без реални credentials в кода —
конфигурира се през `.env.local` (виж `.env.example`).

## Сигурност и роли

Пълното описание е в `docs/admin-panel-plan.md` → „Сигурност и роли“. Накратко:

- `customer` няма достъп до `/admin`.
- `staff` вижда и обработва поръчки.
- `admin` управлява меню и потребители.
- `super_admin` може да прави други админи. Раздава се само с ръчен SQL.
- **service role key никога не се използва на client side** — само в
  `lib/supabase/admin.ts` (server-only, с runtime guard).
- **Всички server actions проверяват session и role**, независимо от middleware-а.
- **RLS е включена на всяка таблица** — това е последният слой защита.

### Реализирани таблици

#### profiles
`id (FK auth.users), full_name, email, phone, avatar_url, default_address_id,
created_at, updated_at`
RLS: потребителят чете/пише своя ред; admin+ чете всички.
Създава се автоматично от trigger `handle_new_user`.

#### user_roles
`id, user_id (FK auth.users, unique), role, created_at`
`role in ('customer','staff','admin','super_admin')` — check constraint.
RLS: потребителят чете своята роля; admin+ чете всички; **само super_admin пише**.
Отделна таблица от `profiles` нарочно — виж коментара в SQL файла.

#### user_addresses
`id, user_id (FK auth.users), label, full_name, phone, city, address_line,
entrance, floor, apartment, delivery_note, is_default, created_at, updated_at`
RLS: пълен CRUD само върху собствените редове. Админ достъп **съзнателно липсва**
до появата на поръчките (адресът е лични данни / GDPR).

### Helper функции (SECURITY DEFINER)
`get_current_user_role()`, `is_admin()`, `is_super_admin()`, `is_staff()`
Нужни са, за да не се получи безкрайна рекурсия в RLS policy върху `user_roles`.

## Таблици (чернова)

### categories
`id, slug, name, name_en, description, sort_order, image_url, is_active`

### products
`id, category_id (FK), name, name_en, description, price_eur, image_url, weight,
allergens (jsonb), option_groups (jsonb), is_available, is_featured, tags`

### orders
`id, number, status, type, user_id (nullable), customer (jsonb),
address_id (FK user_addresses) + address (jsonb snapshot), items (jsonb),
totals (jsonb), payment_method, eta_minutes, customer_note,
cancellation_reason, created_at, updated_at`

> Адресът се пази и като **snapshot** (jsonb), не само като FK: ако клиентът
> изтрие или редактира адреса си, старата поръчка трябва да помни къде е била
> доставена. Затова `types/user.ts` пази отделен тип `Address` до `UserAddress`.

> `users` и `admin_users` от старата чернова **отпадат** — Supabase Auth държи
> `auth.users`, а ролите са в `user_roles`.

## Съответствие с типовете
TypeScript типовете в `/types` са водещи.
`types/database.ts` съдържа ръчно написан `Database` тип за auth таблиците,
огледален на SQL-а. Когато Supabase проектът съществува, може да се замени с
генериран:

```bash
npx supabase gen types typescript --project-id <id> > types/database.ts
```

## Следващи стъпки
1. ✅ Auth таблици + RLS + роли (`docs/supabase-auth-schema.sql`).
2. ⏳ Seed на менюто от текущите JSON файлове в `categories` / `products`.
3. ⏳ Замяна на `lib/menu-data.ts` с реални заявки.
4. ⏳ Таблица `orders` + RLS (клиент вижда своите; staff вижда всички).
5. ⏳ Админ policy за `user_addresses`, вързана към поръчките (виж SQL файла).
