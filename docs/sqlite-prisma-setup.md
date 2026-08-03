# SQLite + Prisma — setup & usage

This document explains the database layer of Pizza Pazzo. **Part 1** sets up the
schema and infrastructure only — no cart, checkout, order creation, admin UI or
email is built yet.

## Why SQLite + Prisma?

- **Single service, zero-cost** for a one-restaurant workload — no separate
  database server to run or pay for.
- **Prisma** gives us a typed schema, migrations and a type-safe client.
- On Render the DB is just a file on a **Persistent Disk** (see
  [`render-sqlite-deploy.md`](./render-sqlite-deploy.md)).

> We deliberately do **not** use Supabase for the order system. Any Supabase
> files under `docs/` or `lib/supabase/` are from an earlier stage and are kept,
> not used, by the new order/cart/checkout code.

## Where things live

| Thing                | Path                                             |
| -------------------- | ------------------------------------------------ |
| Prisma schema        | `prisma/schema.prisma`                           |
| Migrations           | `prisma/migrations/` (committed to git)          |
| Local database file  | `prisma/dev.db` (gitignored)                     |
| Render database file | `/var/data/pizza-pazzo.db` (Persistent Disk)     |
| Prisma client singleton | `lib/db.ts` (**server-only**)                 |
| Enum value lists     | `types/order.ts`, `types/user.ts`                |
| Status metadata      | `lib/order-status.ts`                            |
| Checkout validation  | `lib/validators/checkout.ts`                     |

## DATABASE_URL

| Environment | DATABASE_URL                        |
| ----------- | ----------------------------------- |
| Local dev   | `file:./dev.db`                     |
| Render prod | `file:/var/data/pizza-pazzo.db`     |

Locally the value comes from `.env` (created by `prisma init`) or `.env.local`.
Both are gitignored — never commit a real `.env`. See `.env.example` for the
full list of variables.

> If `DATABASE_URL` is missing locally, Prisma commands fail with a clear error.
> Create a `.env` with `DATABASE_URL="file:./dev.db"` (it is gitignored) and
> re-run the command.

## Schema notes (SQLite limitations)

SQLite has no native `enum` type and no `autoincrement()` outside the primary
key, so:

- **Enums are `TEXT` columns.** Allowed values are enforced in TypeScript:
  `USER_ROLES` (types/user.ts), `ORDER_STATUSES`, `PAYMENT_METHODS`,
  `DELIVERY_METHODS` (types/order.ts). Values are UPPERCASE and match the
  `@default(...)` strings in the schema.
- **`Order.orderNumber`** is a unique `Int` assigned by application logic in
  Part 2 (SQLite can only auto-increment the `@id` column).
- **Money uses `Decimal`, never `Float`** — the euro is the only currency, so
  every money column is named `*Eur`. In TypeScript these are represented as
  `string` to preserve precision.

## Common commands

```bash
# Apply schema changes locally + regenerate client (interactive, dev only)
npm run db:migrate

# Regenerate the Prisma Client after pulling schema changes
npm run db:generate

# Open Prisma Studio (browse/edit the local DB in the browser)
npm run db:studio
```

Under the hood these map to:

```bash
prisma migrate dev      # db:migrate
prisma generate         # db:generate
prisma studio           # db:studio
prisma migrate deploy   # db:deploy  (production / Render only)
```

### Running a migration locally

```bash
npx prisma migrate dev --name <descriptive_name>
```

This creates a new folder in `prisma/migrations/`, applies it to `prisma/dev.db`
and regenerates the client. The initial migration is
`init_sqlite_pizza_pazzo`.

### Running migrations on Render

Migrations are applied automatically during deploy by the build command:

```bash
npx prisma migrate deploy
```

`migrate deploy` is non-interactive and only applies already-committed
migrations — never use `migrate dev` in production.

### Opening Prisma Studio

```bash
npm run db:studio
```

Opens a local web UI (default http://localhost:5555) to inspect the tables.

## What's next (Part 2)

Part 1 is database setup only. Still to build:

- Cart persistence / checkout UI
- `createOrder` logic + `orderNumber` assignment
- Order confirmation & admin orders UI
- Resend email notifications
- Kitchen printer logic
- (Later) online payments, delivery tracking
