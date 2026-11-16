# Google Pay и Apple Pay директно на сайта (UPC payByWallet)

**Статус към 14.11.2026:** кодът е довършен и проверен локално с mock отговори. Нищо не е включено: и двата портфейла са изключени по подразбиране. Не е правено реално плащане, а банков тест на портфейли не съществува. **Интеграцията не е доказана като работеща.** За това липсват Apple сертификатите, одобрението от Google и една контролирана реална проверка в продукция.

Клон `feat/upc-wallets` (локален, не е публикуван).

## 1. Какво потвърди ОББ (имейл, ноември 2026)

- Тестови плащания с Apple/Google Pay не се правят. Функционалността е **само в продукция**.
- PROD URL: `https://secure.kbcbank.bg/kbc/payByWallet`
- `gatewayMerchantId` = merchant id = **7331057** (`UPC_MERCHANT_ID`).
- **Notify не се използва.** Всички отговори идват през API.
- За Apple Pay UPC генерират CSR. Те искат имейла, с който е регистриран Apple Developer акаунтът.

## 2. Източници и какво от тях е потвърдено

Прочетени на 14.11.2026 от `docsecom.atlassian.net/wiki/spaces/DOCEN`:

| Страница | Какво дава |
|---|---|
| 49972313 Google Pay Integration | `gateway: "upcua"`, `gatewayMerchantId`, VISA/MASTERCARD, `PAN_ONLY` + `CRYPTOGRAM_3DS`, пликът `{header, payload, signature}`, полетата на payload, `WalletData` = Google токенът. Отговорът е описан само като „final response from UPC server with order details“ |
| 49972321 Order (под Checkout by Google Pay) | „може да се наложи пренасочване към 3D Secure страница“ — **за друг API** (`OrderCreateRequest`/`payMethods`), без формат. Единственото споменаване на 3-D Secure в раздела за портфейли |
| 49972309 Prerequisites, 49972329 Sandbox for Google Pay | `gatewayMerchantId: <your merchant_id>`; UPC имат Google Pay sandbox, но **ОББ изрично казват, че тестови wallet плащания не се правят** — следваме ОББ |
| 49972416 Apple Pay intergation | Свой Merchant ID в Apple Developer, CSR от UPC → Payment Processing Certificate → `apple_pay.cer` към UPC, `Wallet: "APPLE_PAY"`, `WalletData` = токенът от Apple |
| 49973327 Samples (payByToken) | Как се подписват JSON заявките на UPC: RS256 върху `"<header>.<payload>"`. Подписаният отговор е RS512 и съдържа `MerchantID, TerminalID, ApprovalCode, Rrn, HostCode, TranCode, Comment` |
| 1073086472 Transaction status query | Същото правило за подписа. Отговорът е `results[]` с `tranCode`, `amount`, `currency`, `operType` |
| 49973677 Response codes TranCode | Пълната таблица. **999 = „в процес“, междинен статус** |
| 49974584 Timeouts handling | При timeout статусът може временно да е „not found“, докато транзакцията още се обработва. Препоръката е повторна проверка след по-дълъг интервал (напр. 1 час) |
| 49971491 Checkout by Apple Pay | Apple Pay на **hosted страницата** на UPC се активира от UPC, без работа от търговеца. Директната интеграция (49972416) е описана за **мобилно приложение**; за уеб важат правилата на Apple (merchant validation + домейн) |

Не са налични: `secure.upc.ua/go/service/02` („specifications“) дава HTTP 405, а `upc.ua/ecommerce/json-protokol-vzaiemodiyi` дава HTTP 403. В DOCEN няма страница, която да описва конкретно отговора на payByWallet или 3-D Secure за портфейли.

**Изводи, които не са изрично потвърдени за payByWallet** (въпроси в §9):

- Подписът е общото JSON правило на UPC. Страниците за портфейли не го повтарят. Същата форма ОББ вече приема за статус заявката в продукция.
- Отговорът се очаква да е подписан плик като при payByToken. Кодът приема и `ERROR=…` и неподписан текст, но не им вярва.
- 3-D Secure: форматът на пренасочването не е документиран (вж. §4).
- Apple `WalletData`: текстът казва, че се изпраща токенът от Apple. Първата проба е във вида на Apple (`paymentData.header`), а примерната заявка съдържа `paymentTokenHeader` и `"wrappedKey":"null"`. Изпращаме токена точно както го връща Safari.

## 3. Как работи

1. `/checkout/pay/{token}` показва официалния бутон на Google и бутона на Apple Pay. Всеки се показва **само** ако е конфигуриран, сървърът е в продукция и устройството може да плаща (`isReadyToPay` или `ApplePaySession.canMakePayments()`). „Плати с карта“ винаги остава.
2. Портфейлът връща криптирани данни, които отиват в `POST /api/payments/wallet`. Браузърът не изпраща сума.
3. Сървърът взема същия опит за плащане, който би отворил и картовата страница: същите OrderID, PurchaseTime и сума. UPC не приема второ плащане под един OrderID. Има още заключване на поръчката, брояч (най-много 5 изпращания на опит), rate limit и **прозорец за изчакване** (`WALLET_SETTLE_MS` = 60 мин): след неясен отговор същият опит не приема нови данни от портфейл, дори статусът да казва „not found“ — по препоръката на UPC за timeout. Изрично потвърден отказ („ERROR“/отказ + „not found“) го нулира веднага.
4. Заявката към `payByWallet`:
   - Плик `{header, payload, signature}` с header `{"alg":"RS256"}`.
   - Payload: `MerchantID` (7331057), `TerminalID` (E0901028), `OrderID`, `TotalAmount` (число, в центове, **записаната сума**), `Currency` (978, число), `PurchaseTime` (12 цифри), `Wallet`, `WalletData` (токенът като JSON низ), `PurchaseDesc`.
   - Подпис RS256 с ключа от `UPC_PRIVATE_KEY`.
5. Отговорът се проверява с пиннатия сертификат на UPC (`UPC_GATEWAY_CERT`, RS512). Подписан отговор за друг MerchantID, TerminalID или OrderID се отхвърля.
6. **Само подписаната статус заявка** (`/kbc/service/01`) с `000` и точната сума и валута води до PAID. Плащането минава през същия код, който пуска поръчката към кухнята веднъж и изпраща имейла веднъж.
7. Затворен прозорец, „успех“ в браузъра или връщане в сайта не се броят. Ако резултатът е неясен, клиентът отива на страницата „Проверяваме“, а фоновата проверка (reconcile) пита банката, докато не получи окончателен статус.

## 4. Резултати

| Отговор на payByWallet | Статус заявка след него | Резултат за клиента | Нова заявка? |
|---|---|---|---|
| каквото и да е | `000` + точната сума | **PAID** → success | — |
| каквото и да е | `000` с друга сума | PENDING + сигнал `AMOUNT_MISMATCH` за персонала | не |
| подписан отказ (105, 116, 131 …) | същият код | **FAILED** → страница „неуспешно“ | следващото натискане е **нов OrderID** |
| `ERROR=…` или подписан отказ | „not found“ (408) | **DECLINED**, сумата не е изтеглена, клиентът остава на страницата | същият OrderID (безопасно) |
| подписан `000`, `999` (в процес), `290/291/902/909` | не е намерен / технически | **PENDING** → „Проверяваме“ | блокирана (`CHECKING`) за 60 мин или докато банката даде окончателен статус |
| **3-D Secure / пренасочване** (HTML или JSON с `acsUrl`, `PaReq`, `url`…) | — | **PENDING**. Пренасочването не се следва (форматът не е документиран) | не |
| timeout / няма отговор / нечетим / подпис не съвпада | — | **PENDING** | не (`CHECKING` 60 мин; после същият OrderID, никога нов) |
| прозорецът на портфейла е затворен | (нищо не е изпратено) | „прекъснато“, сумата не е изтеглена | — |

Google Pay е ограничен до `CRYPTOGRAM_3DS`. `PAN_ONLY` (карта, записана в Google акаунта, без токен на устройството) може да изисква 3-D Secure пренасочване, а UPC не го описва. Затова `PAN_ONLY` се отказва в настройките, докато UPC не го документира. Apple Pay винаги е с криптограма (`supports3DS`).

При неясен отговор не се прави автоматично ново таксуване. Изоставен опит без транзакция в банката се затваря след 60 минути по съществуващия модел (`reconcile.ts`). Ако пари все пак се появят по-късно, поръчката се задържа за персонала (`PAID_AFTER_CANCEL`) и не се готви.

Поправка в общия код: TranCode **999** („transaction in progress … intermediate status“) досега попадаше под шаблона 9xx = „неуспешно“. Сега е междинен статус (`TECHNICAL_TRAN_CODES`) и за картите. Иначе един незавършен опит можеше да отвори второ плащане.

## 5. Environment variables

Само в продукция (`PAYMENT_ENV=production`, `PAYMENT_PROVIDER=upc`, плащането с карта е включено). Банковите ключове (`UPC_*`) вече са на Render и не се променят.

| Променлива | Вид | Стойност / откъде |
|---|---|---|
| `GOOGLE_PAY_ENABLED` | ключ | `true`, само при изрично активиране |
| `GOOGLE_PAY_MERCHANT_ID` | публична | Google Pay & Wallet Console → Merchant ID. Отделен е от банковия 7331057 |
| `GOOGLE_PAY_ENVIRONMENT` | публична | `PRODUCTION` (по подразбиране). `TEST` = преглед само за персонала, за скрийншотите към Google. Токените **никога** не се изпращат към банката |
| `GOOGLE_PAY_MERCHANT_NAME` | публична | по подразбиране `Pizza Pazzo` |
| `GOOGLE_PAY_AUTH_METHODS` | публична | по подразбиране `CRYPTOGRAM_3DS` (единственият позволен) |
| `APPLE_PAY_ENABLED` | ключ | `true`, само при изрично активиране |
| `APPLE_PAY_MERCHANT_ID` | публична | Apple Developer → Identifiers → Merchant ID, напр. `merchant.bg.pizzapazzo` |
| `APPLE_PAY_MERCHANT_IDENTITY_CERT` | сървърна | Merchant **Identity** сертификат (PEM или base64 PEM), създаден от **наш** CSR |
| `APPLE_PAY_MERCHANT_IDENTITY_KEY` | **ТАЙНА** | частният ключ на Identity сертификата. Само в Render, никога в git |
| `APPLE_PAY_DOMAIN_ASSOCIATION` | публична | съдържанието на файла от Apple Developer → Merchant ID → Merchant Domains → `pizzapazzo.bg` |
| `APPLE_PAY_DOMAIN` | публична | по подразбиране хостът на `APP_BASE_URL` (`pizzapazzo.bg`) |
| `APPLE_PAY_DISPLAY_NAME` | публична | по подразбиране `Pizza Pazzo` |
| `WALLET_COUNTRY_CODE` | публична | по подразбиране `BG` |
| `UPC_WALLET_URL` | публична | **не се задава**. По подразбиране е `https://secure.kbcbank.bg/kbc/payByWallet`. Ако се зададе, трябва да е на хоста на `UPC_GATEWAY_URL` и не може да е тестовият хост |

`GOOGLE_PAY_GATEWAY_MERCHANT_ID` вече не се използва. Ако е останала стойност, различна от `UPC_MERCHANT_ID`, Google Pay се изключва.

Липсваща или противоречива настройка означава, че съответният бутон не се показва (`getWalletSettings(...).problems`).

Двата сертификата на Apple не бива да се бъркат:

- **Payment Processing Certificate** се прави от **CSR на UPC** в нашия Apple акаунт. Файлът `apple_pay.cer` отива при UPC, а частният ключ е у UPC. Само UPC разшифрова токена.
- **Merchant Identity Certificate** се прави от **наш** CSR. Ключът остава у нас и отива в `APPLE_PAY_MERCHANT_IDENTITY_KEY`. С него сървърът ни прави merchant validation към Apple: mTLS, само към хостовете на Apple (`apple-session.ts`), без произволни адреси.

## 6. Активиране: кой какво прави

**Завършено и проверено локално:** кодът, настройките, интерфейсът, `.env.example`, тестовете с mock отговори (§8), typecheck, lint, i18n и build.

**ОББ / UPC**

1. Да получат имейла на Apple Developer акаунта и да изпратят CSR (текст в §9).
2. Да потвърдят, че payByWallet е активиран за терминал E0901028 за Google Pay и за Apple Pay.
3. Отговори на въпросите в §9 (3-D Secure, формат на отговора, Apple `WalletData`).
4. Да приемат `apple_pay.cer` (Payment Processing) от нас.

**Apple Developer** (акаунт на фирмата, собственикът)

1. Identifiers → Merchant IDs → нов: `merchant.bg.pizzapazzo`.
2. Payment Processing Certificate: качва се CSR файлът от UPC, изтегля се `apple_pay.cer` и се изпраща на UPC.
3. Merchant Identity Certificate: наш CSR (`openssl req -new -newkey rsa:2048 -nodes -keyout identity.key -out identity.csr`). Ключът се пази в `~/.secrets`. Полученият `.cer` се превръща в PEM (`openssl x509 -inform der -in merchant_id.cer -out identity.pem`) и отива в `APPLE_PAY_MERCHANT_IDENTITY_CERT` / `_KEY`.
4. Merchant Domains → `pizzapazzo.bg`. Файлът от Apple отива в `APPLE_PAY_DOMAIN_ASSOCIATION`, следва deploy и „Verify“. Не се генерира фиктивен файл.

**Google Pay**

1. Google Pay & Wallet Console (pay.google.com/business/console) → бизнес профил → Merchant ID → `GOOGLE_PAY_MERCHANT_ID`.
2. Google Pay API → Web интеграция → домейн `pizzapazzo.bg`, gateway `upcua`.
3. За прегледа: `GOOGLE_PAY_ENABLED=true` и `GOOGLE_PAY_ENVIRONMENT=TEST`. Персоналът вижда бутона, прави скрийншотите и подава заявка за production достъп. В TEST режим нищо не стига до банката (`PREVIEW_ONLY`). **TEST токен не е банково тестово плащане.** UPC/ОББ не приемат тестови wallet плащания.
4. След одобрението: `GOOGLE_PAY_ENVIRONMENT=PRODUCTION` или празно.

**Контролирана реална проверка** (само след отделно разрешение на собственика)

1. Merge и deploy с изключени портфейли.
2. В режим `staff` (ако собственикът го избере) на Render се задава само един портфейл, напр. `GOOGLE_PAY_ENABLED=true`, после „Save, rebuild, and deploy“.
3. Една поръчка с малка сума (напр. Маргарита 40 см) в работно време:
   - Chrome на Android с карта в Google Wallet (`CRYPTOGRAM_3DS`);
   - за Apple: Safari на iPhone, не приложението.
4. Проверка на лога `[payments] PP… GOOGLE_PAY → payByWallet: HTTP … signed TranCode …`, на статуса `000`, на поръчката (PAID, в кухнята веднъж, един имейл) и на транзакцията в портала на ОББ (сума, OrderID, RRN).
5. Ако банката откаже подписа или формата, портфейлът се изключва веднага (`…_ENABLED=false`) и отговорът от лога се изпраща на ОББ.
6. Възстановяване на сумата: през портала на ОББ.

## 7. Сигурност

- Токенът на портфейла не се записва, не се логва и не се връща. В лога остават само HTTP кодът, видът на отговора и TranCode (проверено с маркер в тестовете).
- В браузъра отиват само публични идентификатори: gateway, банковото MerchantID, Google merchantId, имената, сумата.
- Подписан отговор за друг терминал или поръчка се игнорира. Неподписан отговор е само подсказка.
- Merchant validation изпраща нашия клиентски сертификат само към документираните хостове на Apple по HTTPS, порт 443, по пътя `/paymentservices/(startSession|paymentSession)`.

## 8. Автоматизирани проверки (mock, не банкови)

`npm run test:upc` включва `tests/payments-wallet.test.ts` (продукционни идентификатори на ОББ, ключове за еднократна употреба, банката е симулирана). Покрити са:

- настройки: само продукция, URL по подразбиране, `gatewayMerchantId` = MerchantID, отказ на `PAN_ONLY`, TEST само за персонала;
- заявката: RS256 плик, полетата и числата като в примера на UPC;
- отговорите: подписан, подправен, чужд OrderID или терминал, `ERROR=`, 3-D Secure;
- успех (PAID, в кухнята веднъж), подписан `000` без потвърждение (PENDING), разминаване в сумата;
- отказ, след който OrderID остава същият, и регистриран отказ, след който идва нов OrderID;
- timeout, `999`, 3-D Secure, двоен клик и три таба наведнъж (едно извикване), лимит на опитите, TEST преглед без заявка;
- прозорец за изчакване: след неясен отговор второ натискане е `CHECKING` без заявка към банката; след прозореца — пак същият OrderID.

**Това не са реални банкови тестови плащания.** Те доказват само нашата страна по документацията.

## 9. Текст до ОББ / UPC (НЕ е изпратен)

> До: pos_support@ubb.bg (копие: служителят от ОББ, който води терминала)
> Относно: Pizza Pazzo — MID 7331057 / TID E0901028 — Apple Pay CSR и payByWallet
>
> Здравейте,
>
> Благодарим за отговора за Apple Pay и Google Pay.
>
> 1. **CSR за Apple Pay.** Имейлът, с който е регистриран Apple Developer акаунтът, е: **[ПОПЪЛНЕТЕ: имейл на Apple Developer акаунта]**. Моля, генерирайте CSR за Payment Processing Certificate. Нашият Merchant ID ще бъде **[ПОПЪЛНЕТЕ: напр. merchant.bg.pizzapazzo]**. Готовия `apple_pay.cer` ще върнем на посочения от Вас адрес.
>
> След като прочетохме документацията на UPC (Google Pay Integration, Apple Pay integration, Samples, Transaction status query), остават следните технически въпроси:
>
> 2. **Активиране.** Активирани ли са Google Pay и Apple Pay през payByWallet за терминал E0901028, или е нужна отделна заявка?
> 3. **3-D Secure.** Страниците за payByWallet не описват 3-D Secure; само страницата „Order“ споменава, че „може да се наложи пренасочване към 3D Secure страница“. Какво връща `https://secure.kbcbank.bg/kbc/payByWallet` в този случай (полета или формат), как се довършва плащането и как получаваме крайния резултат? Дотогава предлагаме Google Pay само с `CRYPTOGRAM_3DS`. Приемливо ли е това за Вас?
> 4. **Отговор.** Потвърждавате ли, че отговорът на payByWallet е подписан JSON `{header, payload, signature}` (RS512, със същия продукционен сертификат на UPC като статус заявката) с полета `TranCode`, `ApprovalCode`, `Rrn`, `HostCode`? Има ли и други полета или стойности (напр. `999`)?
> 5. **Подпис на заявката.** Потвърждавате ли, че payByWallet се подписва като статус заявката: RS256 върху `base64url(header) + "." + base64url(payload)`, с `TotalAmount` и `Currency` като числа (978)?
> 6. **Apple WalletData.** Изпращаме целия `payment.token` точно както го връща Apple Pay JS (`paymentData` с `header`, `paymentMethod`, `transactionIdentifier`). В примера на UPC има `paymentTokenHeader` и `"wrappedKey":"null"`. Кой вид очаквате?
> 7. **Apple Pay в уеб.** Страницата „Apple Pay integration“ описва мобилно приложение. За сайта ще правим merchant validation със собствен Merchant Identity Certificate и ще верифицираме домейна `pizzapazzo.bg` в нашия Apple акаунт. Потвърждавате ли, че от страна на UPC е нужен само Payment Processing Certificate (`apple_pay.cer`) и нищо друго (напр. списък с домейни)? За какво точно ще използвате имейла на Apple Developer акаунта?
> 8. **Статус и timeout.** Вижда ли се транзакцията през payByWallet в `/kbc/service/01` под същия OrderID? Какъв timeout препоръчвате за payByWallet? Правилно ли е при липса на отговор да не изпращаме заявката отново, а само да проверяваме статуса?
>
> Поздрави,
> [ПОПЪЛНЕТЕ: име, длъжност], Pizza Pazzo
