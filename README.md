# Pizza Pazzo 🍕

Онлайн система за поръчки на ресторант **Pizza Pazzo** — публичен сайт, дигитално
меню, количка, поръчки с доставка, клиентски профили и административен панел.

> **Статус:** Етап 0 — структура/скеле. Всички страници се отварят с placeholder
> съдържание. Разработката продължава feature по feature — виж
> [`docs/system-roadmap.md`](docs/system-roadmap.md).

## Технологии
- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- Zustand (клиентско състояние)
- Данни: статичен JSON сега → Supabase по-късно

## Стартиране локално

```bash
# 1. Инсталиране на зависимостите
npm install

# 2. (по избор) променливи на средата
cp .env.example .env.local

# 3. Стартиране в режим на разработка
npm run dev
```

Отворете <http://localhost:3000>.

Полезни скриптове:
- `npm run dev` — режим на разработка
- `npm run build` — production build
- `npm run start` — стартиране на build
- `npm run lint` — линтване
- `npm run type-check` — проверка на типовете

## Структура на проекта

```
app/            Next.js App Router — страници и API routes
  menu/         Дигитално меню (списък, категория, продукт)
  cart/         Количка
  checkout/     Финализиране на поръчка
  auth/         Вход и регистрация
  profile/      Клиентски профил и история на поръчки
  order-success/ Потвърждение на поръчка
  admin/        Административен панел (поръчки, меню, продукти, настройки)
  api/          API routes (orders, emails, print) — засега заготовки
components/     Reusable React компоненти по домейн (layout, menu, cart, admin, ui…)
lib/            Помощни функции, константи, шаблони (имейли, печат), data-слой
types/          TypeScript типове (product, category, cart, order, user, admin, database)
store/          Zustand хранилища (cart, admin-orders)
data/           Примерни данни в JSON (меню, категории, алергени, поръчки)
docs/           Документация (scope, roadmap, database, admin, printing, questions)
assets/         Изходни материали (снимки, лога, скрийншоти) — не се сервира директно
public/         Статични файлове, сервирани публично
_downloads-and-unused/  Работни/непродукционни материали (виж папката)
```

## Ключови файлове
- [`docs/project-scope.md`](docs/project-scope.md) — идеята на системата
- [`docs/system-roadmap.md`](docs/system-roadmap.md) — етапите на разработка
- [`docs/database-plan.md`](docs/database-plan.md) — план за базата (Supabase)
- [`docs/admin-panel-plan.md`](docs/admin-panel-plan.md) — админ панел
- [`docs/printing-plan.md`](docs/printing-plan.md) — печат на 80mm термален принтер

## Какво още НЕ е направено (умишлено)
Без реална база данни, онлайн плащания, реално изпращане на имейли, финален
дизайн или сложни интеграции. Всичко това идва по-късно, стъпка по стъпка.
