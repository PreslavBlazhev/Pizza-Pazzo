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
ORDER_NOTIFICATION_EMAIL=pr2.blazhev@gmail.com
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

```
npm install && npx prisma generate && npx prisma migrate deploy && npm run build
```

What each step does:

- `npm install` — install dependencies.
- `npx prisma generate` — generate the Prisma Client for the runtime.
- `npx prisma migrate deploy` — apply committed migrations to the disk DB
  (non-interactive; safe for production — never use `migrate dev` here).
- `npm run build` — build the Next.js app.

## 5. Start Command

```
npm start
```

## 6. First deploy checklist

- [ ] Persistent Disk attached at `/var/data` **before** the first deploy.
- [ ] `DATABASE_URL=file:/var/data/pizza-pazzo.db` set in Render env vars.
- [ ] Build command includes `prisma migrate deploy`.
- [ ] `prisma/migrations/` is committed to git (it is — only `*.db` is ignored).
- [ ] After deploy, orders persist across a manual restart (smoke test).

---

## Why not a managed Postgres?

SQLite + Prisma keeps this project single-service and zero-cost to run for a
single-restaurant workload. The only operational requirement is the Persistent
Disk. If traffic ever outgrows SQLite, the Prisma schema can be re-pointed at
Postgres with a provider change and a fresh migration.
