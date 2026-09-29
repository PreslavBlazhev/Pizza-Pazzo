# Проверки и доказателства — ОББ изисквания

Изпълнено на **29.09.2026**, Windows 11, Node 21.5.0 (проектът иска 22 —
npm предупреждава, без ефект), Next.js 15.5.20, Prisma 5.22, Chrome
(инсталиран) през playwright-core. Всички отчети:
`docs/ubb-evidence/reports/`, screenshots: `docs/ubb-evidence/screenshots/`
(UBB) и `docs/ubb-evidence/payment-screenshots/` (платежен симулатор).
Само фиктивни клиенти (`ubb-e2e@example.test` и др.); тестовите поръчки са
изтрити след всеки run; имейл не е изпратен (сървърът е пускан с празен
`RESEND_API_KEY` — логът показва „skipping notification“).

## Вид на проверките

| Вид | Какво значи |
|---|---|
| **unit/integration** | node:test върху нова временна SQLite, изградена от миграциите |
| **mock (симулатор)** | локален сървър с `PAYMENT_PROVIDER=simulator` — **не банка** |
| **local production build** | `next build` + `next start` с `APP_ENV=production` на localhost |
| **browser** | реален Chrome, телефон 390×844 и desktop 1280×800 |
| **public read-only** | само GET към публичните адреси, без промени |

**Банков sandbox и реално плащане: НЕ са изпълнени** — няма достъп/параметри от ОББ.

## Команди и резултати

| # | Команда | Резултат | Отчет |
|---|---|---|---|
| 1 | `npm run type-check` | OK, 0 грешки | `01-type-check.txt` |
| 2 | `npm run lint` | OK, 0 грешки/предупреждения | `02-lint.txt` |
| 3 | `npm run check:i18n` | 630 ключа, BG/EN в синхрон | `03-i18n.txt` |
| 4 | `npx prisma validate` + `migrate diff` | валидна; миграции == схема | `04-prisma.txt` |
| 5 | `npm run smoke` | SMOKE OK | `05-smoke.txt` |
| 6 | `npm run test:payments` | 52/52 pass | `06-test-payments.txt` |
| 7 | `npm run test:ubb` | 18/18 pass | `07-test-ubb.txt` |
| 8 | `npm run db:verify-migration` | 8/8 ✓ (копие с 5 стари поръчки) | `08-migration.txt` |
| 9 | `npm run build` | OK, 86 страници; 2 стари предупреждения от `jose` в Edge | `09-build.txt` |
| 10 | `npm run e2e:prod-guard` (local production build, съхранен демо режим EVERYONE) | 9/9 ✓ | `10-production-guard.txt` |
| 11 | `npm run e2e:ubb` (browser, dev сървър без Resend) | 180 ✓, 0 ✗ | `11-e2e-ubb-browser.txt` |
| 12 | `npm run e2e:payments` (HTTP, **mock**) | E2E OK | `12-e2e-payments-http-mock.txt` |
| 13 | `npm run e2e:browser` (browser, **mock**) | BROWSER E2E OK | `13-e2e-payments-browser-mock.txt` |
| 14 | `npm run e2e:alarm` (кухненско табло, browser) | E2E OK, 6 сигнала | `14-e2e-kitchen-alarm.txt` |
| 15 | `npx tsx scripts/preview-accepted-email.ts` | текст на имейла с търговеца и версиите | `15-accepted-email-preview.txt` |

Не е пускано: Android unit тестовете (Kotlin кодът не е променян);
реално Android устройство; банков sandbox.

## Какво доказва всяка група (по минималните критерии от задачата)

1. **16-те точки** — `docs/UBB-COMPLIANCE.md`; текстовете са прегледани по
   смисъл; тестът „texts never promise…“ пази от ODR/лв./„14 дни за пица“.
2. **Правни/контактни линкове BG и EN, от footer и checkout, без вход** —
   #11: 7 страници × 2 езика × 2 екрана → 200, без сурови ключове; footer
   BG/EN съдържа всички 7 линка; от checkout линкът отваря документа в нов
   раздел.
3. **Телефон и desktop, overflow, клавиатура** — #11: без хоризонтален
   overflow на всяка страница и в checkout; чекбоксовете се маркират със
   Space; Tab стига от чекбокса до линка му.
4. **Поръчка без потвържденията** — UI: #11 („no order without confirmations“);
   API: #7 — всяко от трите поотделно, всички заедно, невалидни стойности;
   UI заобиколен (чекбокс изтрит от DOM) → сървърът отказва, BG и EN (#11).
   Валидна поръчка пази трите версии и сървърно време (#7, #11).
5. **Манипулация на цена/total/валута** — #7 (8 вида payload, вариант 40 см,
   количество), #6 („browser cannot change prices…“, „amount sent … stored total“).
   Промоционални отстъпки в кода няма — не са приложими.
6. **Доставка/часове/наличност** — #7 (друг град отказан от сървъра),
   #5 (проверките за работно време и ръчно затваряне), #6 и #7 (неналичен продукт отказан).
7. **Платежни сценарии (mock)** — #12/#13: success, decline, retry на
   същата поръчка, 3-D Secure (симулиран), pending, cancel, късно
   потвърждение, 3 едновременни клика → 1 сесия,
   повторени callback-и → 1 освобождаване, фалшив callback → 401,
   success URL без плащане не маркира платено, картови цифри не напускат
   браузъра (538 заявки проверени). Timeout на доставчика — #6 („provider
   timeout: nothing changes, no failure is invented; later answer wins“).
8. **Симулаторът е недостъпен в production** — #10 + тестове „UBB-07“.
9. **Без регресия в брой/админ/кухня** — #12 („cash order goes straight to
   the kitchen“), #13 (админ маркери, бележки), #14 (аларма); печат — само
   генериране на текста на бележката, без принтер.
10. **Typecheck, lint, build, тестове** — #1–#9. Нищо не е изключено;
    три стари теста са **актуализирани** към новото изискване (EVERYONE в
    production вече не показва демото), не отслабени; фикстурата на
    #14 беше счупена от 26.09 (липсваше `releasedToKitchenAt`) — поправена.
11. **Миграция върху копие** — #8: 5 представителни стари поръчки (в брой,
    платени, отказана, анонимизирана, с добавки) — всички стари колони и
    редове непроменени, нула измислени съгласия, телефонът поправен само при
    точно грешната стойност.

## Публична read-only проверка (29.09.2026)

- `https://pizzapazzo.bg/`, `https://www.pizzapazzo.bg/` → 200 от nginx
  (стар статичен сайт, IP 52.49.91.249 / 34.242.51.224); `http://` → 301 към
  https. **DNS не сочи към новото приложение.**
- `https://pizza-pazzo.onrender.com/` → 200 (Next.js, Cloudflare). На живо
  все още е старият код: `/payment-methods` → 404, canonical на `/terms`
  сочи към началната страница (поправено в клона: `lib/seo/alternates.ts`;
  проверено на local production build — `/en/terms` → canonical
  `https://pizzapazzo.bg/en/terms`).
- Промените **не са deploy-нати** (виж `UBB-OPERATIONS.md` §6).

## Открити и поправени проблеми по време на проверките

1. Чекбоксовете се „размаркираха“ в DOM след сървърен отказ (React form
   reset) → формата се изпраща ръчно (`CheckoutForm.handleSubmit`).
2. Публично демо плащане с карта в production → ограничено до служители.
3. Canonical на всички правни страници сочеше към началната.
4. Непотвърдени алергени се показваха като факт.
5. Google Maps се зареждаше без действие на посетителя.
6. Вторият телефон беше без код на града.
7. Общите условия препращаха към закритата ODR платформа (20.07.2025).
8. Фикстура на `e2e:alarm` без `releasedToKitchenAt`.

## Checkpoint (за продължаване)

- Клон: `feat/ubb-compliance` (от `master` @ ff70e34).
- Направено: всичко по-горе; документи UBB-*.md.
- Остава (външно): `UBB-BUSINESS-DATA.md` §2, `UBB-OPERATIONS.md` §6.
- Повторение на проверките: командите от таблицата; за #11 —
  `RESEND_API_KEY= npx next dev` + `npm run e2e:ubb`; за #12–#14 —
  dev сървър с `APP_ENV=development CARD_PAYMENTS_ENABLED=true
  PAYMENT_PROVIDER=simulator PAYMENT_SIMULATOR_SECRET=<16+ знака>
  APP_BASE_URL=http://localhost:3000 RESEND_API_KEY=` и същите env в
  shell-а на теста; за #10 — `npm run build`, после `APP_ENV=production
  APP_BASE_URL=https://pizzapazzo.bg RESEND_API_KEY= CARD_PAYMENTS_ENABLED=false
  npx next start -p 3001` и `E2E_BASE_URL=http://localhost:3001 npm run e2e:prod-guard`.
