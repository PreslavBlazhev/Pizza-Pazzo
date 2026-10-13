# Render deployment — SQLite + Prisma + Persistent Disk

Pizza Pazzo uses **SQLite** as its database, managed with **Prisma**. On Render
the SQLite file **must live on a Persistent Disk**, otherwise it is wiped on
every redeploy/restart.

> ⚠️ **Without a Persistent Disk the SQLite file is ephemeral.** Render's
> filesystem is reset on each deploy and on restarts. All orders/users would be
> lost. A Persistent Disk must be attached **before** any production use.

---

## 1. Create the Web Service

1. Render Dashboard → **New** → **Web Service**.
2. **Connect the GitHub repo** for Pizza Pazzo.
3. Environment: **Node**. Branch: your production branch (e.g. `master`).

## 2. Environment variables

Add these under **Environment** → **Environment Variables**:

```
DATABASE_URL=file:/var/data/pizza-pazzo.db
RESEND_API_KEY=
ORDER_NOTIFICATION_EMAIL=pizzapazzopln@gmail.com
FROM_EMAIL=Pizza Pazzo <orders@pizzapazzo.bg>
NEXT_PUBLIC_SITE_URL=https://your-render-url.onrender.com
```

Notes:

- **`DATABASE_URL` points at the Persistent Disk mount** (`/var/data`). This is
  the single most important setting — it must match the disk mount path below.
- Locally you instead use `DATABASE_URL="file:./dev.db"` (see `.env.example`).
- `RESEND_API_KEY` stays empty until email is wired up in a later part.
- Replace `NEXT_PUBLIC_SITE_URL` with your real Render URL (or custom domain).
- Do **not** paste real secrets into the repo — only into Render's dashboard.

## 3. Add a Persistent Disk

Render Dashboard → your service → **Disks** → **Add Disk**:

- **Mount Path:** `/var/data`
- **Size:** at least **1 GB**

The `DATABASE_URL` above (`file:/var/data/pizza-pazzo.db`) writes the SQLite
file into this mounted disk, so it survives redeploys and restarts.

## 4. Build Command

Render Dashboard → your service → **Settings** → **Build Command** must be
exactly:

```
npm ci && npx prisma generate && npm run build
```

What each step does:

- `npm ci` — a clean install of exactly `package-lock.json`.
- `npx prisma generate` — generate the Prisma Client for the runtime.
- `npm run build` — the Next.js production build (Turbopack).

Everything the build needs — Tailwind, PostCSS, Autoprefixer, TypeScript and
its `@types`, and the Prisma CLI — is in `dependencies`, not
`devDependencies`. Render (or a `NODE_ENV=production` environment variable)
makes npm leave devDependencies out; the build then failed with
`Cannot find module 'tailwindcss'` (13 October 2026). Do not move these back.
`devDependencies` holds only what the build and the site never use (ESLint,
`tsx`, Playwright, `@types/bcryptjs`). The CI job "Render production
install" repeats exactly this install with `NODE_ENV=production` and builds.

Migrations do **not** run here: the Persistent Disk is not mounted during the
build.

## 5. Start Command

```
node scripts/backup-before-migrate.mjs && npx prisma migrate deploy && npm start
```

- `backup-before-migrate.mjs` — when a migration is pending, a checked backup
  of the database is written to `/var/data/backups/` first.
- `npx prisma migrate deploy` — apply committed migrations to the disk DB
  (non-interactive; never use `migrate dev` here). It uses the installed
  Prisma CLI, so nothing is downloaded at start.
- `npm start` — start the site.

## 6. First deploy checklist

- [ ] Persistent Disk attached at `/var/data` **before** the first deploy.
- [ ] `DATABASE_URL=file:/var/data/pizza-pazzo.db` set in Render env vars.
- [ ] Build command is `npm ci && npx prisma generate && npm run build`.
- [ ] Start command includes `prisma migrate deploy` (not the build command).
- [ ] `prisma/migrations/` is committed to git (it is — only `*.db` is ignored).
- [ ] After deploy, orders persist across a manual restart (smoke test).

---

## Why not a managed Postgres?

SQLite + Prisma keeps this project single-service and zero-cost to run for a
single-restaurant workload. The only operational requirement is the Persistent
Disk. If traffic ever outgrows SQLite, the Prisma schema can be re-pointed at
Postgres with a provider change and a fresh migration.
