# Google Pay и Apple Pay директно на сайта (UPC payByWallet)

Статус (11.11.2026): кодът е готов и тестван локално; **нищо не е включено** — без
env променливите по-долу бутоните не се показват. Не е правено реално плащане.

## Как работи

1. Страницата `/checkout/pay/{token}` показва официалния бутон на Google
   (`createButton` от pay.js, само ако `isReadyToPay`) и/или Apple Pay бутона
   (CSS `-apple-pay-button`, само ако `ApplePaySession.canMakePayments()`).
   Под тях винаги остава „Плати с карта“.
2. Портфейлът връща **криптирани** данни → `POST /api/payments/wallet`.
3. Сървърът взема (или създава) **същия опит за плащане**, който би отворил и
   картовата страница — същите OrderID + PurchaseTime + сума. UPC отказва второ
   плащане под един OrderID, така че карта + портфейл или две натискания не могат
   да вземат пари два пъти. Плюс: заключване на поръчката, брояч на изпращанията
   (макс. 5 на опит), rate limit.
4. Сумата е **записаната сума на поръчката** — браузърът не изпраща сума.
5. Заявката към UPC `payByWallet`: `{header, payload, signature}`, header
   `{"alg":"RS256"}`, payload = MerchantID, TerminalID, OrderID, TotalAmount (число),
   Currency (978, число), PurchaseTime, Wallet (`GOOGLE_PAY`/`APPLE_PAY`), WalletData
   (токенът като JSON низ), PurchaseDesc. Подпис RS256 върху `header.payload` с
   нашия ключ — същата форма, която ОББ вече приема за статус заявката.
6. Отговорът на payByWallet **никога** не значи „платено“. Веднага след него
   се прави подписаната статус заявка; само `000` + точната сума и валута → PAID
   (същият код, кухненски гейт и имейл като при картата). NOTIFY също работи.
7. Резултат към клиента: PAID → success; FAILED → failed (нов опит = нов OrderID);
   DECLINED (UPC отказа заявката и статусът казва „няма транзакция“) → остава на
   страницата, може да опита пак; всичко неясно (timeout, 3-D Secure, нечетим
   отговор) → pending страницата, която продължава да проверява.
8. Затваряне на портфейла → нищо не се изпраща към сървъра; съобщение „прекъснато“.
9. Токенът не се записва, не се логва и не се връща (проверено в тестовете).

## Test срещу production — адреси

| | Test (sandbox) | Production (ОББ) |
|---|---|---|
| Hosted страница | `https://ecg.test.upc.ua/kbc/pay` | `https://secure.kbcbank.bg/kbc/pay` |
| Статус | `https://ecg.test.upc.ua/kbc/service/01` | `https://secure.kbcbank.bg/kbc/service/01` |
| payByWallet (UPC docs, общ) | `https://ecg.test.upc.ua/go/payByWallet` (линк в docs) | `https://secure.upc.ua/go/payByWallet` (текст в docs) |
| payByWallet за ОББ — **проба, не потвърдено** | `https://ecg.test.upc.ua/kbc/payByWallet` → 405 на GET | `https://secure.kbcbank.bg/kbc/payByWallet` → 405 на GET |

- На хоста на ОББ `/go/payByWallet` дава **404**, затова общият адрес от
  документацията не е приложим за ОББ.
- Празен неподписан POST към тестовия `/kbc/payByWallet` → HTTP 200, `ERROR=Undefined error`.
- Кодът **няма** вграден адрес: `UPC_WALLET_URL` е задължителен, трябва да е на
  същия хост като `UPC_GATEWAY_URL`, а sandbox ↔ тестов хост, production ↔ не-тестов.
- Google environment следва `PAYMENT_ENV` (sandbox → TEST, production → PRODUCTION).

## Environment variables

| Променлива | Задължителна | Стойност |
|---|---|---|
| `UPC_WALLET_URL` | да (за всеки портфейл) | адрес payByWallet от ОББ/UPC |
| `WALLET_COUNTRY_CODE` | не | по подразбиране `BG` |
| `GOOGLE_PAY_ENABLED` | да | `true` |
| `GOOGLE_PAY_GATEWAY_MERCHANT_ID` | да | UPC „Point of Service Id (pos_id)“ — от UPC |
| `GOOGLE_PAY_MERCHANT_ID` | в production | Merchant ID от Google Pay & Wallet Console |
| `GOOGLE_PAY_MERCHANT_NAME` | не | по подразбиране `Pizza Pazzo` |
| `GOOGLE_PAY_AUTH_METHODS` | не | по подразбиране `PAN_ONLY,CRYPTOGRAM_3DS` (UPC docs) |
| `APPLE_PAY_ENABLED` | да | `true` |
| `APPLE_PAY_MERCHANT_ID` | да | напр. `merchant.bg.pizzapazzo` (наш Apple Merchant ID) |
| `APPLE_PAY_MERCHANT_IDENTITY_CERT` | да | Merchant Identity сертификат (PEM или base64 PEM) |
| `APPLE_PAY_MERCHANT_IDENTITY_KEY` | да | неговият частен ключ (PEM или base64 PEM) — ТАЙНА |
| `APPLE_PAY_DOMAIN` | не | по подразбиране хостът на `APP_BASE_URL` (`pizzapazzo.bg`) |
| `APPLE_PAY_DISPLAY_NAME` | не | по подразбиране `Pizza Pazzo` |
| `APPLE_PAY_DOMAIN_ASSOCIATION` | да (за верификация на домейна) | съдържанието на файла от Apple; сервира се на `/.well-known/apple-developer-merchantid-domain-association` |

Липсваща или несъвместима настройка = съответният бутон не се показва
(проблемите са в `getWalletSettings(...).problems`).

## Какво трябва да получим от ОББ / UPC

1. Активиране на Google Pay и Apple Pay за терминала (тест 1731096/E7059096 и
   production 7331057/E0901028) — по UPC docs не са включени по подразбиране.
2. **Точния адрес на payByWallet** за ОББ — test и production (потвърждение на
   `…/kbc/payByWallet`).
3. **pos_id** (`gatewayMerchantId`) за Google Pay — за всеки терминал; дали е
   MerchantID или отделен идентификатор.
4. Спецификацията на payByWallet (`secure.upc.ua/go/service/02` не се отваря):
   точно подписвания низ, base64 или base64url, типове на TotalAmount/Currency,
   формат на отговора, кодове, **как се връща 3-D Secure** за `PAN_ONLY`
   (докато не е ясно, такъв отговор остава „pending“ и клиентът може да плати с карта).
5. Дали изпращат NOTIFY и за payByWallet транзакции.
6. За Apple Pay: CSR файл от UPC (ec@upc.ua) за Payment Processing Certificate.

## Какво трябва да настроим в Google

1. Google Pay & Wallet Console (pay.google.com/business/console) → бизнес профил
   → **Merchant ID** → `GOOGLE_PAY_MERCHANT_ID`.
2. Интеграция Web: добавяне на `pizzapazzo.bg`, скрийншотове на checkout потока
   (с TEST environment), заявка за production достъп; gateway = `upcua`.
3. Брандинг: използва се официалният бутон на Google (createButton) — не се сменя.

## Какво трябва да настроим в Apple

1. Apple Developer акаунт (на фирмата) → Identifiers → **Merchant ID**
   (напр. `merchant.bg.pizzapazzo`) → `APPLE_PAY_MERCHANT_ID`.
2. **Payment Processing Certificate**: CSR от UPC → качване в Apple → изпращане
   на `apple_pay.cer` на ec@upc.ua (UPC разшифрова токена).
3. **Merchant Identity Certificate**: наш CSR (ключът остава у нас) → `.cer` →
   PEM → `APPLE_PAY_MERCHANT_IDENTITY_CERT` / `_KEY`.
4. **Merchant Domains**: добавяне на `pizzapazzo.bg`, файлът от Apple в
   `APPLE_PAY_DOMAIN_ASSOCIATION`, deploy, „Verify“.
5. Проверка само в Safari (iPhone/Mac с карта в Wallet). В iOS приложението
   (WKWebView с инжектиран скрипт) Apple Pay остава скрит.

## Проверка преди включване (без реални пари)

1. Sandbox: env с тестовия `UPC_WALLET_URL` и тестов pos_id → Google Pay TEST
   карта → тестова поръчка (staff) → логът `payByWallet: HTTP … signed TranCode …`
   и статус `000` → тестовата поръчка е PAID и **не** отива в кухнята.
2. Ако UPC откаже подписа → сравнете с отговора им по т. 4 (base64/base64url).
3. Production само след потвърждение от ОББ, в режим `staff`, с малка сума.

Тестове: `npm run test:upc` (включва `tests/payments-wallet.test.ts`, 19 теста).
