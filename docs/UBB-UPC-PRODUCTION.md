# ОББ виртуален ПОС — продукционна среда (MID 7331057 / TID E0901028)

Подготвено на 30.10.2026, актуализирано на 02.11.2026. ОББ потвърди на 02.11.2026 (14:26), че сертификатът е качен в продукция и ВПОС е активиран за реални плащания. Превключването става по §5; проверките от 02.11 са в §7.

Свързани: `UBB-UPC-INTEGRATION.md` (интеграцията и тестовата среда), `UBB-UPC-TEST-REPORT.md`, `UBB-UPC-EMAILS.md`.

---

## 1. Параметри от ОББ (имейл от pos_support@ubb.bg, 30.10.2026, 16:46)

| | |
|---|---|
| MerchantID / TerminalID | `7331057` / `E0901028` (Name: pizzapazzo.bg) |
| Gateway | `https://secure.kbcbank.bg/kbc/pay` |
| Търговски портал | `https://secure.kbcbank.bg/kbc/merchant` — потребител и първоначална парола са в имейла на банката (не се копират никъде; паролата се сменя при първо влизане; в портала влиза само собственикът) |
| Сайт / валута | https://pizzapazzo.bg/ — EUR (978) |

Тестовата трансакция в sandbox е проведена на 30.10.2026 (поръчка №1041, OrderID `PP1041-F432E581`, 10,23 EUR, TranCode 000, NOTIFY приет). Банката потвърди, че Google Pay / Apple Pay **не могат** да се тестват в sandbox.

## 2. Ключ и сертификат

Генерирани на 30.10.2026 (преди това нямаше ключ/сертификат за 7331057 никъде на машината и в репото). Тестовият комплект `upc-test-1731096` не е пипан.

- RSA 2048, X.509 самоподписан, `sha512WithRSAEncryption`, валиден 30.10.2026 – 29.10.2029;
- subject `C=BG, L=Pleven, O=PIZZA PAZZO EOOD, OU=e-commerce production MID 7331057 TID E0901028, CN=7331057`;
- SHA-256 на сертификата: `87:8B:4C:06:6E:23:FD:10:A7:37:18:CB:FA:AF:98:1E:77:E7:15:D2:D1:BE:AD:85:E9:EC:8C:E3:6F:B1:06:20`;
- проверено: еднакъв модул ключ ↔ сертификат, успешен sign/verify SHA-512;
- `7331057.zip` съдържа **само** `7331057.crt`, AES-256; отваря се с паролата и се отказва с грешна.

| Файл | Къде | Тайна? |
|---|---|---|
| `7331057.pem`, `7331057.pem.base64.txt` (→ `UPC_PRIVATE_KEY`) | `%USERPROFILE%\.secrets\pizza-pazzo\upc-prod-7331057\` (права само за потребителя, извън Git и публичните папки) | **ДА** |
| `zip-password.txt` — паролата на архива | същата папка | **ДА** — съобщава се на банката отделно (телефон/отделно съобщение), никога в имейла с архива |
| `7331057.crt`, `7331057.crt.base64.txt` (→ `UPC_MERCHANT_CERT`) | същата папка | не |
| `UPC_GATEWAY_CERT.production.base64.txt` | същата папка | не (публикуван от UPC) |
| `7331057.zip` + `7331057.crt` за изпращане | `Desktop\ОББ-ПРОДУКЦИЯ-сертификат-7331057-за-изпращане\` | не |

## 3. Установени продукционни параметри (източници)

| Параметър | Стойност | Източник / проверка |
|---|---|---|
| `UPC_GATEWAY_URL` | `https://secure.kbcbank.bg/kbc/pay` | имейл на ОББ + UPC „Endpoints“ → BULGARIA (v55, 28.07.2026) |
| `UPC_STATUS_URL` | `https://secure.kbcbank.bg/kbc/service/01` | UPC „Endpoints“ → BULGARIA. Същата форма `/kbc/service/01` е проверена в sandbox. **Проба 30.10.2026:** една подписана JSON справка за несъществуващ OrderID (`PPPRODPROBE-0001`, без трансакция) → HTTP 200, `{"results":[],"TranCode":"291","Comment":"Invoice was not found"}` |
| `UPC_GATEWAY_CERT` | публикуваният от UPC „Production Certificate“ (CN=server, RSA 1024), SHA-256 `00:D5:B5:3A:1A:0E:0B:C0:54:8A:18:13:91:96:1F:68:AA:71:31:5E:FB:FC:B6:55:1C:7C:5F:8E:3D:F7:5B:A4` | UPC „Production Certificate“ (стр. 49971882), посочен от „Data Signature“ и „NOTIFY_URL“ като сертификат за работната среда. **Подписът на горния отговор на secure.kbcbank.bg се проверява с него и SHA-512; с тестовия — не.** Копие: `lib/payments/upc/certs.ts` (`UPC_PRODUCTION_GATEWAY_CERT`) — само за сравнение, **не е подразбиране**. |
| `UPC_GATEWAY_SIGNATURE_ALGS` | `sha512` | отговорът на статус справката е `{"alg":"RS512"}`; в sandbox реалният NOTIFY (№1041) е приет със sha512. За NOTIFY в продукция — въпрос 3 към ОББ. |
| `UPC_REQUEST_SIGNATURE_ALG` | `sha512` (подразбиране) | UPC „Data Signature“; работи в sandbox |
| `PAYMENT_CURRENCY` | `EUR` | параметрите от ОББ |

Неуточнени (в имейла до ОББ): потвърждение на сертификата/hash за NOTIFY в продукция, IP адресите на NOTIFY (UPC документира 217.13.180.171 — сайтът не филтрира по IP, проверява подписа), Google Pay/Apple Pay, анулиране след неуспешно уведомление, сесия/опити, достъп до портала (*.p12?), разрешение за контролирана първа трансакция.

## 4. Защити срещу смесване на тестова и продукционна среда (в кода)

- `PAYMENT_ENV=production` изисква собствен `PAYMENT_PRODUCTION_AUDIENCE` = `staff` | `everyone`; **`PAYMENT_SANDBOX_AUDIENCE` не важи за продукцията** и ако е останал зададен, картите се изключват (половинчато превключване).
- Продукция изисква `UPC_MERCHANT_CERT`; CN на сертификата трябва да е `UPC_MERCHANT_ID` и сертификатът трябва да съвпада с ключа → тестовият ключ 1731096 не може да подписва за 7331057 (и обратно).
- Тестовият сертификат на UPC в продукция → отказ; продукционният в sandbox → отказ; gateway и статус справка на различни хостове → отказ; тестов gateway в продукция → отказ (беше и преди).
- Всеки опит пази средата си (`PaymentAttempt.environment`): sandbox опит никога не се проверява с продукционния терминал, NOTIFY за опит от другата среда → `reverse`. Допълнително: справка за опит, създаден за друг MerchantID/TerminalID, не се изпраща изобщо.
- Админ → Настройки → „Онлайн плащане с карта“ показва **„Незавършени опити (ОББ)“ по среда** и „Кой вижда картата“.

## 5. Превключване — само след потвърждение от ОББ

**Предварителни условия:** (1) ОББ е потвърдила писмено, че `7331057.crt` е качен в продукционната среда; (2) отговорени са поне въпроси 1–3 (валута, статус адрес, сертификат/hash за NOTIFY) — ако банката посочи друг сертификат или hash, се ползва нейният; (3) кодът с тези промени е деплойнат.

**Стъпка 0 — незавършени sandbox опити.** Админ → Настройки → „Незавършени опити (ОББ)“ трябва да е „няма“ (или само `production`). Ако има `sandbox: N` — изчакайте/проверете ги, докато тестовият терминал още е настроен (фоновата проверка ги приключва); тестовите поръчки никога не отиват в кухнята. След превключването те повече не се проверяват.

**Стъпка 1 — портал (собственикът):** `https://secure.kbcbank.bg/kbc/merchant` → смяна на първоначалната парола → Терминали → 7331057 → E0901028:

| Поле | Стойност |
|---|---|
| SUCCESS_URL | `https://pizzapazzo.bg/api/payments/upc/success` |
| FAILURE_URL | `https://pizzapazzo.bg/api/payments/upc/failure` |
| NOTIFY_URL | `https://pizzapazzo.bg/api/payments/upc/notify` |
| Брой опити за въвеждане на данни от карта | 1 (или препоръката на ОББ) |
| Анулиране след неуспешно уведомление | според отговора на ОББ (въпрос 7) — не се пипа без него |

Адресите са същите като в тестовия портал и вече работят. Докато сайтът е на тестовия терминал, продукционен NOTIFY не може да възникне (няма продукционни заявки).

**Стъпка 2 — Render (Environment на услугата `pizza-pazzo`, една промяна → един деплой).** Стойностите в `.secrets\…\upc-prod-7331057\` се копират с отваряне на файла (Notepad) → Ctrl+A → Ctrl+C; не се поставят в чат/имейл.

| Ключ | Действие / стойност |
|---|---|
| `CARD_PAYMENTS_ENABLED` | `true` |
| `PAYMENT_PROVIDER` | `upc` (без промяна) |
| `PAYMENT_ENV` | `sandbox` → **`production`** |
| `PAYMENT_SANDBOX_AUDIENCE` | **изтрийте** променливата |
| `PAYMENT_PRODUCTION_AUDIENCE` | **`staff`** (пилот само за персонала) |
| `PAYMENT_CURRENCY` | `EUR` |
| `UPC_MERCHANT_ID` | `7331057` |
| `UPC_TERMINAL_ID` | `E0901028` |
| `UPC_PRIVATE_KEY` | Secret: съдържанието на `7331057.pem.base64.txt` (замества тестовия ключ) |
| `UPC_MERCHANT_CERT` | съдържанието на `7331057.crt.base64.txt` |
| `UPC_GATEWAY_CERT` | съдържанието на `UPC_GATEWAY_CERT.production.base64.txt` (или сертификатът, посочен от ОББ) |
| `UPC_GATEWAY_URL` | `https://secure.kbcbank.bg/kbc/pay` |
| `UPC_STATUS_URL` | `https://secure.kbcbank.bg/kbc/service/01` |
| `UPC_GATEWAY_SIGNATURE_ALGS` | `sha512` (или потвърденото от ОББ) |
| `UPC_REQUEST_SIGNATURE_ALG`, `UPC_STATUS_PROTOCOL` | не се задават (sha512 / json) |
| `CARD_BRAND_MARKS` | **не** се задава до публичното включване |

Всички тестови стойности (1731096, E7059096, тестовият ключ) се **заменят**, не се добавят до продукционните. След деплоя: Админ → Настройки трябва да показва `upc / production`, „Кой вижда картата: само влезлия персонал“, без червени причини. Ако има причина — тя казва точно коя променлива е грешна; дотогава картата не се предлага и сайтът приема само плащане в брой.

**Стъпка 3 — контролирана първа реална трансакция (само след разрешение от ОББ, въпрос 6).** Влязъл служител → поръчка с малка сума → „Плащане с карта“ → реална карта на служител. Проверка: TranCode 000; в Render лога `[payments] UPC notify … sig=sha512`; поръчката е „Платено онлайн“ и **реално отива в кухнята** (продукционна поръчка — предупредете кухнята или откажете поръчката и възстановете сумата през портала). Резултатът се записва в `UBB-UPC-TEST-REPORT.md` и се съобщава на ОББ.

**Стъпка 4 — публично включване (след успешната стъпка 3):** `PAYMENT_PRODUCTION_AUDIENCE=everyone`, `CARD_BRAND_MARKS=visa,mastercard`, деплой с **Save, rebuild, and deploy**. Текстовете в Общите условия и Доставка вече зависят от активните методи, а футърът и страница „Начини на плащане“ четат `isCardPaymentLive()`. Статичните страници се генерират при build, затова е нужен rebuild, а не само restart. Докато е `staff`, клиентите не виждат картата и публичните текстове казват, че онлайн плащането не е активно.

**Build или runtime:** адаптерът чете всички `PAYMENT_*`, `CARD_*` и `UPC_*` при изпълнение, но статичните страници запазват резултата от build. Затова: **Save only** не прилага нищо до следващ деплой; **Save and deploy** е достатъчно само за спиране/пускане на нови плащания; **Save, rebuild, and deploy** е задължително при промяна на аудиторията.

**Връщане назад:** Бързо спиране: `CARD_PAYMENTS_ENABLED=false` → Save, rebuild, and deploy (спира нови плащания, започнатите продължават да се проверяват и платените поръчки остават платени). Само за персонала: `PAYMENT_PRODUCTION_AUDIENCE=staff` → същият деплой. Обратно към тестовия терминал: всички тестови стойности **заедно** — смесица се отказва от кода; преди това изчакайте да няма незавършени продукционни опити (Админ → Настройки).

## 6. Google Pay / Apple Pay — проверка в продукция (НЕ са тествани)

Портфейлите се предлагат на hosted страницата на UPC; сайтът няма собствени бутони. Проверката е възможна само в продукция и само след като ОББ потвърди активирането им за E0901028 (въпрос 5). Тогава, в пилотния режим `staff`:

1. Google Pay — Chrome на Android с карта в Google Wallet: поръчка → карта → на страницата на UPC трябва да има бутон Google Pay → плащане с малка сума → TranCode 000, NOTIFY приет (`WalletType=GOOGLE_PAY`, ако ОББ го включи).
2. Apple Pay — Safari на iPhone с карта в Apple Wallet: същото; ако ОББ изиска верификация на домейна, файлът се публикува първо.
3. Android приложението (WebView): очаква се Google Pay да **не** е наличен там — клиентът плаща с карта; да се провери и отбележи.
4. Резултатите (дата, OrderID, метод, TranCode, възстановяване) се записват в `UBB-UPC-TEST-REPORT.md`. Дотогава портфейлите се водят „нетествани“ и не се рекламират.

## 7. Проверки срещу продукционния gateway, 02.11.2026 (без плащане и без въведена карта)

| Проверка | Резултат |
|---|---|
| Ключ ↔ сертификат | Публичните ключове на `7331057.pem` и `7331057.crt` съвпадат; CN=7331057 |
| Заявка с нашия подпис (`PPCHKgoodmvzdxjcz`, 1,00 EUR, Currency=978) | Страница за карта: 1.00 EUR, търговец pizzapazzo.bg. Плащане не е направено |
| Контрола: същата заявка с чужд ключ | „Заявката е неуспешна“ — подписът реално се проверява, значи банката има нашия сертификат |
| Статус справка | HTTP 200, RS512, проверява се с публикувания Production Certificate на UPC |
| Форма на „няма плащане“ | Страница не е отваряна: `results:[]`, 291. Страница отворена без плащане: `results:[{tranCode:"408"}]`. И двете се четат като „няма плащане“; поправено в `providers/upc.ts` |
| Повторно подаване на същата заявка | Отваря страницата отново, без отказ 412 |
| Google Pay (Chrome, Windows) | Бутон „Buy with G Pay“ на hosted страницата; `profile: PRODUCTION`, `gateway: upcua`, VISA и MASTERCARD. Плащане не е правено |
| Apple Pay (Chrome, Windows) | Кодът е в страницата с `supportedNetworks: masterCard, visa`, но бутонът се показва само при `ApplePaySession` (Safari). Има `countryCode: "UA"` — въпрос към ОББ. Изисква проверка на устройство на Apple |
| „Обратно към търговеца“ | `href="pizzapazzo.bg"` без `https://`, води към страница на банката. Нужна е поправка на адреса на терминала |

Не може да се провери без портала или реална трансакция: регистрираните SUCCESS/FAILURE/NOTIFY адреси и алгоритъмът на подписа на продукционния NOTIFY. Ако подписът се различава, NOTIFY получава `reverse` и плащането се анулира — парите не се губят, а логът показва причината.

## 8. Проверка 05.11.2026 — „картата се вижда само от администратори“, Apple Pay

**Причина за „само администратори“ (установена, не е бъг в кода).** Render е в пилотния режим от §5, стъпка 2: `PAYMENT_PRODUCTION_AUDIENCE=staff`. `resolveCheckoutPayment()` (`lib/payments/providers/index.ts`) предлага картата само на STAFF/ADMIN, а `placeOrder` отказва картова поръчка от гост/клиент със същото правило. Живи доказателства: Админ → Настройки показва „Кой вижда картата: само влезлия персонал“; `GET https://pizzapazzo.bg/checkout` без бисквитки съдържа `"cardAvailable":false`, а влязъл админ вижда „Плащане онлайн с карта“. Никъде няма списък с позволени потребители или друга проверка по роля — `/api/payments/start`, връщането и NOTIFY работят с токена на поръчката и подписа на банката, независимо от ролята.

**Стъпка 3 (успешна реална трансакция) НЕ е минала.** Продукционни опити: #1047 (отказана), #1049, #1052 — всички с отворена страница без плащане (TranCode 408), сума 10,23 €. Затова подписът на продукционния NOTIFY остава недоказан (ако се различава → `reverse`, сумата се анулира, логът казва кой hash би минал).

**Поправката = стъпка 4** (`PAYMENT_PRODUCTION_AUDIENCE=everyone`, `CARD_BRAND_MARKS=visa,mastercard`, **Save, rebuild, and deploy**). Кодът е готов и покрит с тест „production public launch (everyone)“ в `tests/payments-upc.test.ts`: гост, клиент, служител и админ получават картата; поръчка от гост е реална (`isTest=false`) и отваря подписана заявка към `secure.kbcbank.bg/kbc/pay` за MID 7331057/TID E0901028, валута 978 и сумата от записаната поръчка, подписана със SHA-512 с продукционния ключ; поръчката не е платена преди потвърждение от банката.

**Apple Pay / Google Pay — показват се от страницата на UPC/ОББ, не от нашия сайт.** Проба 05.11 (подписана заявка 1,00 €, OrderID `PPCHKAP…`, без карта):
- Google Pay: `googlePay.js` + `gPay.js`, `gateway: upcua`, `profile: PRODUCTION`. Показва се и в Safari на iPhone — затова на iPhone се вижда само Google Pay.
- Apple Pay: `applePay.js`, Apple merchant ID **`merchant.ua.upc.ec`** (на UPC, не наш), `countryCode: "UA"`, `currencyCode: "EUR"`, `supportedNetworks: masterCard, visa`, `merchantCapabilities: supports3DS`. Бутонът се показва **само** ако `window.ApplePaySession` съществува и `ApplePaySession.canMakePaymentsWithActiveCard("merchant.ua.upc.ec")` върне `true`. Иначе бутонът остава скрит, а формата за карта работи.
- `https://secure.kbcbank.bg/.well-known/apple-developer-merchantid-domain-association.txt` → 200 (5768 B): банката е публикувала файла за домейн-верификация. Дали `secure.kbcbank.bg` е реално свързан с `merchant.ua.upc.ec` при Apple, отвън не може да се провери.
- Домейн-верификация за `pizzapazzo.bg` **не е нужна**: Apple Pay се изпълнява на домейна на банката.

`canMakePaymentsWithActiveCard` е `false`, когато: в Apple Wallet няма активна Visa/Mastercard, позволена за този търговец; в Safari е изключено „Check for Apple Pay“ (Settings → Apps → Safari); merchant ID-то на UPC не е валидно за домейна на банката; или страницата е в WKWebView, в който приложението вмъква скриптове.

**Наше ограничение — iOS приложението.** То зарежда страницата на банката в собствения си WKWebView, който вмъква `PrintBridge.userScript` (`ios-app/PizzaPazzo/Web/PrintBridge.swift`). WebKit изключва Apple Pay в WKWebView с вмъкнати скриптове. Ако плащането е отворено от приложението, Apple Pay няма да се покаже, независимо от банката. В Safari това не важи.

**За да се докаже причината за Apple Pay** (нужен е реален iPhone; на Windows не може): Safari (не приложението) → Settings → Safari → „Check for Apple Pay“ включено; карта в Wallet. Отворете плащането и в Safari Web Inspector (Mac → Develop → iPhone) изпълнете на страницата на банката `ApplePaySession.canMakePayments()` и `await ApplePaySession.canMakePaymentsWithActiveCard("merchant.ua.upc.ec")`:
- `canMakePayments()` е `true`, а втората проверка е `false` при карта в Wallet → проблемът е в конфигурацията на UPC/ОББ (merchant ID/домейн/активиране за E0901028). Въпрос към pos_support@ubb.bg. Попитайте и за `countryCode: "UA"`.
- И двете са `true`, но бутон няма → също въпрос към ОББ/UPC.
- Бутонът се показва → Apple Pay работи. Остава тестово плащане с малка сума само с изрично разрешение на собственика.

## 9. Потвърждение от банката, изоставени плащания, връзка към търговеца, iOS (05.11.2026, вечер)

### 9.1 Проверка на подписа на NOTIFY в продукция

| | Стойност | Източник |
|---|---|---|
| Сертификат | публикуваният от UPC „Production Certificate“ (CN=server), SHA-256 `00:D5:B5…5B:A4`; в Render `UPC_GATEWAY_CERT`; кодът отказва тестовия в продукция | UPC „Data Signature“ → „Work certificate“; §3 |
| Алгоритъм | `sha512` (`UPC_GATEWAY_SIGNATURE_ALGS`) | Примерът на UPC (`openssl_verify` без алгоритъм) означава SHA-1, но: истинският NOTIFY в sandbox (№1041) е подписан със SHA-512, а продукционната справка за статус е `RS512` с същия сертификат. Първото реално плащане ще покаже кой hash използва продукционният NOTIFY. При отказ логът казва `the signature verifies only with the unaccepted sha1` и тогава се добавя `sha1` |
| Подписвани полета | `MerchantId;TerminalId;PurchaseTime;OrderId[,Delay];Xid;CurrencyId[,AltCurrencyId];Amount[,AltAmount];SessionData;TranCode;ApprovalCode;` | „Data Signature“ → „Signature verification“; `gatewaySignatureData()` в `lib/payments/upc/protocol.ts` |
| Формат | `application/x-www-form-urlencoded`, `Signature` = base64; отговор `text/plain` с редове `Параметър=Стойност` + `Response.action/.reason/.forwardUrl` | „NOTIFY_URL“; `buildNotifyResponse()` |

### 9.2 Какво значи „reverse“ (поправка на по-ранно твърдение)

- **`Response.action=reverse`** е **отговорът ни на NOTIFY**, а не отделна операция: молим шлюза да анулира тази авторизация (UPC код 503 „cancelled by the store“). Сайтът **не прави** отделна заявка за анулиране или възстановяване. Възстановяване се прави само ръчно, от портала на банката.
- **Отговорът не доказва анулиране.** `lib/payments/upc/verify.ts` проверява всяко решение с подписана справка за статус. Анулирането се води потвърдено **само** при окончателен код `503`/`504`. Ако банката покаже `000` → сигнал REVERSE_NOT_CONFIRMED и персоналът възстановява сумата през портала. Ако няма ясен отговор (до 8 проверки за 48 ч) → BANK_STATUS_UNVERIFIED.
- Изречението „автоматично се анулира и парите се връщат“ беше **неточно**. Точното е: при невярно уведомление сайтът отказва поръчката и иска анулиране от банката, след което проверява дали банката го е направила.
- **Поправено (код):** съобщение с неверен подпис, без подпис или за чужд терминал вече **не получава `reverse`**. То не получава никакво решение (HTTP 503, без `Response.action`), защото не може да се взима финансово решение по непроверено съобщение. Ако собствената ни проверка е сгрешена, истинското плащане вече не се анулира от нас. Плащането се решава със справката за статус, която има отделна проверка на подписа. Какво прави UPC при неуспешен NOTIFY зависи от настройката на терминала „Анулиране след неуспешно уведомление“ (на E0901028: „Не“).
- `reverse` остава само за **проверени** от UPC съобщения: грешна сума/валута/време, отказана или вече платена поръчка, заменен опит, непознат OrderID на нашия терминал.

### 9.3 Код 408 и безкрайното „Чака плащане“

- По „Transaction status codes“ на UPC **408 = „Transaction not found — the transaction doesn't exist on payment gateway“**. Шлюзът няма трансакция за този OrderID, т.е. формата за плащане не е изпратена. Това **не е отказ**. 601 = клиентът е затворил страницата (окончателно). 411 = остаряла заявка.
- **Проба 05.11:** подписана заявка с PurchaseTime отпреди 0 мин … 3 дни отваря страницата за плащане. Заявката **не изтича при банката**, затова сайтът трябва сам да приключи изоставения опит.
- **Поправено (код, `lib/payments/reconcile.ts`):**
  - Опит, за който **новата справка** 60 минути след създаването му още казва „not found“, става `EXPIRED` (`SESSION_TIMEOUT`). Неплатената поръчка, която не е стигнала до кухнята, се отказва, а предупреждението се изчиства. Технически код или неуспешна справка **не** приключват нищо, а продължават към сигнала за персонала.
  - Поръчка, чийто последен опит е окончателно неуспешен (отказ, 601), и никой не е опитал отново за 60 мин, се отказва.
- **Закъснели потвърждения:**
  - NOTIFY 000 за отказана поръчка → `reverse` веднъж. Повторният NOTIFY получава същия записан отговор, а записаният reverse не може да стане плащане при справка 000.
  - Без NOTIFY: повторната справка за изтеклия опит (24 ч) намира парите → поръчката е „платена“ със сигнал PAID_AFTER_CANCEL (за възстановяване от портала) и не отива в кухнята. Сумата се отчита веднъж.
  - Тестове: `npm run test:upc`, 4 нови.
- Поръчки #1049 и #1052 (и опитът на вече отказаната #1047) се приключват автоматично след деплоя при следващата фонова проверка.

### 9.4 „Обратно към търговеца“

Страницата на UPC взима адреса от **настройката на терминала при банката**: `merchant: {name: "pizzapazzo.bg", url: "pizzapazzo.bg"}` и `<a href="pizzapazzo.bg">`. Нашата заявка не съдържа такова поле, а в портала полето е само за четене. Без `https://` браузърът го тълкува като относителен път към страница на банката. Текстът към ОББ е в §10.

### 9.5 Apple Pay — merchant ID и countryCode

- UPC „Checkout by Apple Pay“: при хоствана страница Apple Pay работи без технически действия от търговеца и се активира по заявка към UPC (ec@upc.ua) или през банката. Използва се merchant ID-то на UPC `merchant.ua.upc.ec`. **Не се сменя от нас**: собствен merchant ID трябва само при директна интеграция, каквато нямаме.
- `countryCode: "UA"` е в заявката на UPC към Apple Pay. За Google Pay същата страница дава `countryCode: "BG"`. Определя го UPC/ОББ и ние не можем да го сменим. Въпросът е в §10.

### 9.6 iOS приложението — подготвена промяна (НЕПРОВЕРЕНА на устройство)

`WebViewFactory.detachPrintBridge` / `attachPrintBridge` (`ios-app/PizzaPazzo/Web/PrintBridge.swift`). `WebViewModel.startPayment` маха вмъкнатия скрипт и message handler-а преди зареждането на страницата на банката, а `endPayment` ги връща при връщане в сайта, вкл. след изтекла сесия. Подписаната заявка, сесията (същият WKWebView и същите бисквитки) и връщането към поръчката остават същите. Компилирането се проверява в GitHub Actions (`ios.yml`). Дали Apple Pay се появява в приложението се доказва само на реален iPhone с карта в Wallet.

## 10. Текст към ОББ (pos_support@ubb.bg) — корекции по терминала 7331057 / E0901028

> Здравейте,
>
> Относно виртуалния ПОС на Пица Пацо ЕООД — MerchantID 7331057, TerminalID E0901028 (pizzapazzo.bg):
>
> 1. На платежната страница бутонът „Обратно към търговеца“ води към `pizzapazzo.bg` без протокол (`<a href="pizzapazzo.bg">`) и браузърът отваря несъществуваща страница на secure.kbcbank.bg. Моля, коригирайте адреса на търговеца в настройките на терминала на **https://pizzapazzo.bg/** (с `https://`). В търговския портал полето не може да се редактира от нас.
> 2. Apple Pay: на платежната страница бутонът не се показва на iPhone със Safari и карта в Apple Wallet, а Google Pay се показва. Моля, потвърдете дали Apple Pay е активиран при UPC за терминал E0901028. Страницата ползва merchant ID `merchant.ua.upc.ec`, т.е. активирането е при UPC (ec@upc.ua).
> 3. В заявката за Apple Pay страницата подава `countryCode: "UA"`, докато за Google Pay е `"BG"`. Правилна ли е стойността `UA` за български търговец?
> 4. Моля, потвърдете с кой hash алгоритъм е подписан NOTIFY в продукционната среда (SHA-512 или SHA-1) и с кой сертификат.
>
> Благодаря!

## 11. Контролирана реална проба (staff режим) — плаща собственикът/разработчикът лично

**Кога:** при отворено заведение (днес 11:00 – 22:30). `/api/payments/start` отказва плащане при затворено заведение. Режимът остава `PAYMENT_PRODUCTION_AUDIENCE=staff` до успешната проба.

**Сума:** **10,23 €** (Маргарита 40 см, без добавки; доставката е безплатна; минимумът е 10,00 €). Сумата се изчислява и записва от сървъра.

**Стъпки (влезли като администратор, Chrome на компютъра или Safari на iPhone):**
1. pizzapazzo.bg → Меню → Маргарита 40 см → в количката (само тя) → Поръчай.
2. Данни: име **„ТЕСТ ОББ — [вашето име]“**, вашият телефон и имейл, адрес за доставка, бележка **„ПРОБНО КАРТОВО ПЛАЩАНЕ — ОББ“**. Така пробата се разпознава в админа и в кухнята.
3. Плащане: **„Плащане онлайн с карта“** → трите отметки → изпращане → „Плати с карта“.
4. На страницата на банката (secure.kbcbank.bg) проверете, че пише **10.23 EUR** и pizzapazzo.bg. Въведете своята карта и минете 3-D Secure. Ако на iPhone се покаже Apple Pay, можете да платите с него.
5. Изчакайте връщането към сайта („Плащането е успешно“ / проверка на плащането). **Не затваряйте страницата преди връщането.**
6. Пишете ми номера на поръчката.

**Какво проверявам след това (без да пипам портала):**
банка (подписана справка 000, сума 1023, валута 978) → NOTIFY (запис `notifyAction=approve`, XID, TranCode 000; в лога `[payments] UPC notify … → approve (ok) sig=sha512`) → подпис (кой hash) → поръчката и сумата (10,23 €, EUR) → статус „Платено онлайн“ → **едно** пускане към кухнята (`releasedToKitchenAt`, един имейл до ресторанта) → проверка на решението при банката (`bankVerifiedAt`).

**Пробата е реална поръчка.** Ако не искате доставка, откажете поръчката от админа и възстановете 10,23 € от портала на ОББ. Сайтът не прави възстановяване сам.

**Отказан и отменен сценарий:** в продукция няма тестови карти. Отказ може да се види с карта без наличност или при грешен 3-D Secure код, по ваш избор. Отмяна: бутонът „Отказ“/затваряне на страницата на банката. След 60 мин без плащане поръчката се отказва автоматично (§9.3). Тези сценарии са покрити с автоматичните тестове и с реалния sandbox тест от 30.10.

## 12. Who is offered real card payment — Admin → Settings (06.11.2026)

The audience is now a switch in **Admin → Настройки → „Реални плащания чрез ОББ“**:
the checkbox **„Реално плащане с карта — достъпно за всички клиенти“** (on =
everyone, off = signed-in staff only). It is stored in the database
(`RestaurantSettings.cardProductionAudience`, migration
`20261106120000_card_production_audience`) and **replaces**
`PAYMENT_PRODUCTION_AUDIENCE` when set — the admin page shows which source
applies and the server value that is no longer used. It survives restarts and
redeploys, needs no rebuild (the footer and legal pages refresh through the
settings cache tag) and changes only WHO is offered the card: terminal, keys,
currency and every check of the bank's confirmations stay on the server, and
without a valid production terminal no one is offered the card. The demo
simulator stays separate and staff-only in production.

`CARD_BRAND_MARKS` unset now means the footer schemes (Visa, Mastercard) next
to the card option at checkout.

Code: `lib/payments/production-audience.ts`, `loadPaymentConfig()` in
`lib/payments/providers/index.ts`, `app/actions/admin-card-audience.ts`,
`components/admin/CardAudienceForm.tsx`.

## 13. Apple Pay missing on ОББ's page — diagnosis (06.11.2026)

Reported: real iPhone, Safari (not the app), active card in Wallet; ОББ's page
for **PP1056-2E85C35A** (10.23 EUR) shows Google Pay only. ОББ says both are active.

**Our request — not the cause.** `POST https://secure.kbcbank.bg/kbc/pay`,
MerchantID 7331057, TerminalID E0901028, Currency 978, TotalAmount in cents,
OrderID, PurchaseTime, PurchaseDesc, locale, Signature (RS512)
(`lib/payments/providers/upc.ts` buildUpcPaymentForm). UPC's hosted page has
no request parameter that selects payment methods (UPC docs, Checkout by Apple
Pay: "no need to perform any additional technical actions on the part of the
merchant"); the page for our terminal does contain the Apple Pay block.

**What hides the button (the bank's page, `/kbc/jscript/applePay.js?v=3.71`).**
`.applePay {display:none}`; the inline script calls
`new UPCApplePay("merchant.ua.upc.ec", {countryCode:"UA", currencyCode:"EUR", supportedNetworks:["masterCard","visa"], merchantCapabilities:["supports3DS"], …})`,
whose constructor runs `ApplePaySession.canMakePaymentsWithActiveCard("merchant.ua.upc.ec")`
and shows the button only on `true`. No `else`, no `.catch`, no logging — a
`false` or a rejection leaves the button hidden silently.
This is the AVAILABILITY check. Merchant validation (`onvalidatemerchant` →
POST `/kbc/enter/<session>` `action=applePayVerification` → Apple session;
failure = `alert("Undefined error. Try later.")`) only runs after a tap, so it
is not reached when the button never shows. `countryCode` is used only by
`new ApplePaySession(…)` after the tap — not by the availability check.

**What that check depends on.** WebKit
(`Source/WebKit/Shared/ApplePay/cocoa/WebPaymentCoordinatorProxyCocoa.mm`,
`platformCanMakePaymentsWithActiveCard`) passes the merchant identifier AND
the page's domain to PassKit:
`PKCanMakePaymentsWithMerchantIdentifierDomainAndSourceApplication(merchantIdentifier, domainName, …)`,
which asks Apple's servers. So the answer is about the pair
`merchant.ua.upc.ec` + `secure.kbcbank.bg`, besides the phone and its cards.

**The finding.** `https://secure.kbcbank.bg/.well-known/apple-developer-merchantid-domain-association.txt`
(200, 5768 bytes, checked 06.11.2026 14:26 UTC) is a PKCS#7 signed by Apple
whose content is
`{"teamId":"DY28LAW573","domain":"cardpayment.rbinternational.com","dateCreated":"2026-10-23,06:13:27","version":1}` —
byte-identical (sha256 9f855e6de4e66b66…) to the file served by
`cardpayment.rbinternational.com`. The same Apple team (DY28LAW573 = UPC: its
`secure.upc.ua` file says `"domain":"secure.upc.ua"`, `ecg.test.upc.ua` says
`"domain":"ecg.test.upc.ua"`) issues one file PER DOMAIN; a file for
`secure.kbcbank.bg` would name `secure.kbcbank.bg`. The bank's domain
therefore cannot (re)verify with Apple under UPC's merchant ID with this file.
TLS of secure.kbcbank.bg: Google Trust Services WE1, 15.09.2026 – 14.12.2026
(Apple ties domain verification to the TLS certificate and re-checks around renewal).

**Status: strong evidence, not final proof.** Missing, and who has it:
1. UPC (Apple Developer account of team DY28LAW573, merchant ID
   merchant.ua.upc.ec → Merchant Domains): is `secure.kbcbank.bg` listed and
   VERIFIED? Only UPC can see it.
2. The phone's own answer: iPhone → Settings → Apps → Safari → Advanced →
   Web Inspector ON; Mac Safari → Develop → [iPhone] → the bank page; in the
   console:
   `await ApplePaySession.canMakePayments()` and
   `await ApplePaySession.canMakePaymentsWithActiveCard("merchant.ua.upc.ec")`.
   Expected if this is the cause: `true` / `false`. Needs a Mac (the owner).

Nothing in our code, request or configuration changes this; countryCode,
merchant ID and certificates are UPC's and are NOT changed by us.

### Inquiry text (NOT sent) — to pos_support@ubb.bg, please forward to UPC (ec@upc.ua)

Тема: Apple Pay не се показва на платежната страница — терминал E0901028 (MID 7331057), pizzapazzo.bg

Здравейте,

На платежната страница https://secure.kbcbank.bg/kbc/pay за нашия терминал
Apple Pay не се показва, въпреки че е потвърдено като активно. Google Pay се
показва нормално.

Данни:
- Търговец: pizzapazzo.bg; MerchantID 7331057; TerminalID E0901028; валута 978 (EUR)
- Сесия: OrderID PP1056-2E85C35A, 10.23 EUR, 06.11.2026 (час — по логовете ви за този OrderID)
- Възпроизвеждане без плащане: OrderID PPCHKAPmw52jic6, 1.00 EUR, 06.11.2026 14:27:26 UTC,
  сесия /kbc/pay/963e968a/812e29eaa1ef493caf8d36cf34c5f19e/
- Устройство: iPhone, Safari (не вградено приложение), активна карта в Apple Wallet

Какво виждаме в страницата: бутонът е скрит (`.applePay {display:none}`) и се
показва само ако `ApplePaySession.canMakePaymentsWithActiveCard("merchant.ua.upc.ec")`
върне true (applePay.js?v=3.71). Safari прави тази проверка за двойката
merchant ID + домейн на страницата (secure.kbcbank.bg) чрез сървърите на Apple.

Файлът https://secure.kbcbank.bg/.well-known/apple-developer-merchantid-domain-association.txt
(5768 байта) е подписан от Apple за друг домейн:
{"teamId":"DY28LAW573","domain":"cardpayment.rbinternational.com","dateCreated":"2026-10-23,06:13:27","version":1}
— идентичен с файла на cardpayment.rbinternational.com. За сравнение secure.upc.ua
връща файл с "domain":"secure.upc.ua".

Моля, проверете и ни отговорете конкретно:
1. Регистриран и потвърден (Verified) ли е домейнът secure.kbcbank.bg към
   merchant ID merchant.ua.upc.ec в Apple Developer акаунта на UPC (team DY28LAW573)?
   Ако не е, или потвърждението е изтекло — моля, публикувайте на
   secure.kbcbank.bg верния файл за този домейн и го потвърдете отново.
2. Какъв е резултатът от проверката на Apple Pay в логовете ви за сесия
   PP1056-2E85C35A (ако страницата регистрира такъв) и има ли грешки при
   applePayVerification за терминал E0901028.
3. Има ли друга настройка на терминал E0901028, която спира Apple Pay в тази сесия.

Не сме променяли и няма да променяме countryCode, merchant идентификатора или
сертификатите — те са от страницата на UPC.

Поздрави,
Pizza Pazzo — pizzapazzo.bg
