# Pizza Pazzo — Production Launch Checklist

Стъпка по стъпка от GitHub до работещ сайт на Render. Следвай реда.
Пълните обяснения за SQLite на Render: `docs/render-sqlite-deploy.md`.

---

## 0. Предварително (еднократно)

- [ ] GitHub repo: `PreslavBlazhev/Pizza-Pazzo`, клон **master** (пушнат).
      В GitHub Settings → Branches провери, че default branch е `master`.
- [ ] Render акаунт с **платен план** (Persistent Disks не работят на free).
- [ ] Resend акаунт (resend.com) → API key. За да пращаш от
      `orders@pizzapazzo.bg`, домейнът трябва да се верифицира в Resend
      (DNS записи). До тогава може да се ползва `onboarding@resend.dev`
      за тест.
- [ ] Локално: Node 22 LTS (`nvm use` чете `.nvmrc`). Prisma остава 5.22,
      докато не мигрираме (тя работи и на 22).

## 1. Render service

- [ ] New → Web Service → свържи GitHub repo-то.
- [ ] Или: New → Blueprint и посочи `render.yaml` (той описва всичко долу).
- [ ] Branch: `master`
- [ ] Runtime: Node · Plan: Starter (или по-висок)
- [ ] Build command:
      `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- [ ] Start command: `npm start`

## 2. Persistent Disk (ЗАДЪЛЖИТЕЛНО преди първия deploy)

- [ ] Disk name: `pizza-pazzo-data`
- [ ] Mount path: `/var/data`
- [ ] Size: 1 GB (стига за години поръчки)
- Без диска SQLite базата се трие при всеки deploy/restart.

## 3. Environment variables (Render dashboard)

| Ключ | Стойност |
|---|---|
| `DATABASE_URL` | `file:/var/data/pizza-pazzo.db` |
| `AUTH_SECRET` | дълъг случаен низ — `openssl rand -base64 48` |
| `ADMIN_EMAIL` | имейлът на първия админ |
| `ADMIN_PASSWORD` | силна парола (смени я след първия вход) |
| `RESEND_API_KEY` | от resend.com |
| `ORDER_NOTIFICATION_EMAIL` | къде пристигат новите поръчки |
| `FROM_EMAIL` | `Pizza Pazzo <orders@pizzapazzo.bg>` (верифициран в Resend) |
| `NEXT_PUBLIC_SITE_URL` | `https://<service>.onrender.com`, после реалния домейн |

- [ ] Всички са попълнени. НЕ ги дръж в git.

## 4. Първи deploy

- [ ] Deploy от dashboard-а → изчакай build + `migrate deploy` да минат.
- [ ] Логовете нямат Prisma грешки.

## 5. Seed на първия админ

- [ ] Render → Shell на service-а → `npm run db:seed`
- [ ] Изход: `✔ Seeded SUPER_ADMIN: <email>` (паролата не се печата).
- [ ] Влез на `/auth/login` с ADMIN_EMAIL/ADMIN_PASSWORD → виждаш `/admin`.

## 6. Smoke проверки на staging

- [ ] `npm run smoke` (локално срещу същия код) — SMOKE OK.
- [ ] Публично: `/`, `/menu`, `/product/margarita`, `/en/menu` → 200, цените
      са „€ / лв.".
- [ ] Регистрация на тестов клиент → вход → профил.
- [ ] Пълна тестова поръчка: количка → checkout → order-success с номер.
- [ ] `/admin/orders` вижда поръчката; приемане с време; отказ с причина.
- [ ] Имейлите пристигат: до ресторанта (нова поръчка) и до клиента
      (прието/отказано). Ако не — провери RESEND_API_KEY/FROM_EMAIL.
- [ ] `/admin/orders/<id>/print` → Ctrl+P на 80mm принтера на ресторанта.
- [ ] SEO: `/opengraph-image` връща PNG; view-source има `application/ld+json`;
      `/sitemap.xml`, `/robots.txt` отговарят.

## 7. Домейн

- [ ] Render → Custom Domains → `pizzapazzo.bg` + `www.pizzapazzo.bg`.
- [ ] DNS при регистрара → CNAME/A по инструкциите на Render.
- [ ] `NEXT_PUBLIC_SITE_URL=https://www.pizzapazzo.bg` → redeploy
      (иначе canonical/OG/JSON-LD сочат към onrender.com).
- [ ] HTTPS сертификатът е издаден (Render го прави сам).

## 8. Преди публичното обявяване (съдържание)

- [ ] Реалните снимки са качени и `imageUrl` е сменен (виж
      `docs/client-assets-needed.md`).
- [ ] Отзивите: секцията е СКРИТА докато няма реални (REVIEWS_ENABLED в
      `lib/constants.ts`). НЕ я пускай с примерните.
- [ ] Алергените за продуктите от `docs/client-allergens-needed.md` са
      потвърдени и въведени.
- [ ] Цените с BGN/EUR разминаване са потвърдени от клиента.
- [ ] EN имената на ястията са одобрени.
- [ ] Такса доставка/зони са реалните (lib/constants.ts DELIVERY_FEE).
- [ ] Градът по подразбиране в checkout е потвърден.

## 9. Rollback план

- Redeploy на предишен commit: Render → Deploys → „Rollback" (кодът се
  връща; базата на диска НЕ се пипа — миграциите ни само добавят).
- Ако база се повреди: диска има snapshot-и на Render (Disk → Snapshots);
  restore + redeploy.
- Локално копие за всеки случай: Render Shell →
  `cp /var/data/pizza-pazzo.db /var/data/backup-$(date +%F).db` преди
  рискови промени.

## 10. След пускане

- [ ] Смени ADMIN_PASSWORD през профила и в Render env (за да не стои
      реалната парола в env).
- [ ] Създай STAFF акаунти за персонала през /admin/users.
- [ ] Провери Core Web Vitals след качването на реалните снимки.
