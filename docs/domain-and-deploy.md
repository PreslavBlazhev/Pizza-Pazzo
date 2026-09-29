# Домейн `.com`, Render и среди

> **Актуално (29.09.2026):** целевият адрес е `https://pizzapazzo.bg` —
> стъпките за него и текущото DNS състояние са в `docs/UBB-OPERATIONS.md` §6.
> Описаното по-долу за `.com` важи по същия начин за всеки нов домейн.

Сайтът има **един** публичен адрес в конфигурацията: `APP_BASE_URL`. От него
се строят canonical/Open Graph адресите, `sitemap.xml`, `robots.txt` и
return/callback адресите за банката. В кода няма фиксиран `onrender.com`
(единственият литерал е последна резервна стойност, ако нищо не е зададено).

## Три среди

| | APP_ENV | Плащане | База | Кой я ползва |
|---|---|---|---|---|
| Локално | `development` | симулатор (по желание) | `prisma/dev.db` | програмист |
| Staging | `staging` | симулатор → после банков **sandbox** | отделен Render диск | вие, за тестове |
| Production | `production` | **само** банка в `PAYMENT_ENV=production`; до договора — изключено | production диск | клиентите, кухнята |

Staging никога не се индексира (`robots.txt` = Disallow, заглавка
`X-Robots-Tag: noindex`) и може да има парола (`STAGING_BASIC_AUTH`).

## Преминаване към `.com` — стъпки

DNS и покупката на домейна правите вие. Кодът не се пипа.

1. **Render → pizza-pazzo → Settings → Custom Domains → Add**:
   `pizzapazzo.com` и `www.pizzapazzo.com` (името е примерно — използвайте
   купения домейн). Render показва точните DNS записи (CNAME за `www`,
   A/ALIAS за основния). Въведете ги при регистратора.
2. Изчакайте Render да покаже **Verified** и издаден сертификат (HTTPS е
   автоматичен). Проверете, че `https://<нов домейн>/` отваря сайта.
   `pizza-pazzo.onrender.com` продължава да работи паралелно.
3. **Render → Environment**: `APP_BASE_URL=https://www.<нов домейн>` (или без
   `www` — един избор, винаги HTTPS, без наклонена черта накрая).
   Ако съществува стар `NEXT_PUBLIC_SITE_URL`, сложете му същата стойност или
   го изтрийте. Save → Render прави нов deploy (с build — sitemap/robots се
   генерират наново).
4. Проверки след deploy:
   - `https://<нов домейн>/robots.txt` → `Sitemap: https://<нов домейн>/sitemap.xml`;
   - HTML на началната страница → `<link rel="canonical" href="https://<нов домейн>/">`;
   - Админ → Настройки → „Онлайн плащане с карта“ → return/callback адресите са с новия домейн.
5. **Банката**: ако return/callback адресите се регистрират в портала им
   (а не се подават с всяко плащане), обновете ги там със стойностите от т. 4.
   Докато банката не е потвърдила, оставете `CARD_PAYMENTS_ENABLED=false`
   или тествайте на staging.
6. **Имейли (Resend)**: верифицирайте новия домейн в Resend и сменете
   `FROM_EMAIL` (напр. `Pizza Pazzo <orders@<нов домейн>>`).
7. **Google Search Console**: добавете новия домейн и изпратете sitemap-а.
8. **Android приложението** (`android-app/gradle.properties`):
   ```
   pizzapazzo.startUrl=https://www.<нов домейн>/
   pizzapazzo.siteHosts=www.<нов домейн>,<нов домейн>,pizza-pazzo.onrender.com,pizzapazzo.bg,www.pizzapazzo.bg
   ```
   **Оставете старите хостове**, докато всички инсталирани приложения се
   обновят. Увеличете `versionCode`/`versionName` в `app/build.gradle.kts`,
   изградете и публикувайте. Приложение, което е запазило стар начален адрес
   от Настройки, се връща към новия автоматично, ако старият хост бъде махнат
   от списъка.

Бележки:
- Сесийните бисквитки са към хоста: на новия домейн персоналът и клиентите
  влизат отново един път. Кошницата (localStorage) също е по хост.
- `www.pizzapazzo.bg` все още е старият сайт на друг сървър — не е свързан с това.
- Canonical към `.com` е достатъчен за SEO; пренасочване от `onrender.com`
  не е задължително.

## Render — какво трябва да е зададено (production)

```
DATABASE_URL=file:/var/data/pizza-pazzo.db        (render.yaml)
UPLOADS_DIR=/var/data/uploads                     (render.yaml)
APP_ENV=production                                (render.yaml)
APP_BASE_URL=https://…                            ← задайте
AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD          ← тайни
RESEND_API_KEY, ORDER_NOTIFICATION_EMAIL, FROM_EMAIL
CARD_PAYMENTS_ENABLED=false                       (render.yaml; true само след т. 3.5 в online-card-payments.md)
PAYMENT_PROVIDER / PAYMENT_ENV / PAYMENT_CURRENCY / банковите ключове ← при банката
```

Миграциите се прилагат автоматично при старт (`npx prisma migrate deploy`).
Миграцията `20260926175017_add_online_card_payments` преписва таблицата
`Order` със запазване на всички редове и маркира всички стари поръчки като
„в брой, вече в кухнята, вече обявени“ — поведението им не се променя.
## Архив на базата (преди всеки deploy с миграция)

**Не използвайте `cp`** на работещата база. Докато сайтът приема поръчки,
SQLite може да е по средата на запис, а в WAL режим последните промени са в
отделен `-wal` файл. Обикновено копие може да е повредено или непълно и
това се разбира едва когато ви потрябва.

Безопасно, докато сайтът работи (Render → услугата → **Shell**):

```
npm run db:backup
```

Скриптът (`scripts/backup-db.mjs`):
1. кара самия SQLite да запише пълно, транзакционно съгласувано копие с
   `VACUUM INTO` → `/var/data/backups/pizza-pazzo-<дата-час>.db`;
2. отваря копието отделно и пуска `PRAGMA integrity_check` (трябва `ok`);
3. сравнява броя редове (поръчки, артикули, плащания, потребители, меню)
   с живата база и ги отпечатва; никога не презаписва съществуващ файл.

Резултат `db:backup: OK` = копието е годно. `≠` на някой ред значи, че е
дошла поръчка по време на архива; копието пак е съгласувано към момента на
старта, пуснете отново, ако искате по-ново. Изход ≠ 0 = копието е негодно.

Собствено име: `npm run db:backup -- /var/data/backups/before-payments.db`.
Архивите са на същия диск: за защита и от загуба на диска изтеглете файла
(Render → Shell не дава сваляне; ползвайте `Disks → Snapshots` на Render или
временно копие към външно хранилище).

**Възстановяване** (рядко; Shell работи само на включена услуга):
1. Админ → „Затвори заведението“, за да няма нови поръчки.
2. Render Shell:
   `cp /var/data/backups/<файл>.db /var/data/pizza-pazzo.db && rm -f /var/data/pizza-pazzo.db-wal /var/data/pizza-pazzo.db-shm`
3. Веднага Render → **Manual Deploy → Restart service**, за да не пише
   процесът върху подменения файл. След рестарта отворете заведението.
