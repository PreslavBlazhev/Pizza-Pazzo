# PIZZA PAZZO — UNIFIED GOOGLE PLAY RELEASE REPORT

| | |
|---|---|
| **Проект** | `C:\Users\The King\Desktop\Sites\08. Pizza Pazzo` |
| **Android модул** | `android-app/` (преименуван от `android-kitchen-app/`) |
| **Repository** | https://github.com/PreslavBlazhev/Pizza-Pazzo |
| **Дата** | 24 август 2026 г. |
| **Commit** | `3aabcd0` |
| **Предходен одит** | `722bf95` — виж `одит.md` на Desktop |

> Всяко твърдение тук е или проверено с изпълнена команда, или изрично
> маркирано като непроверено. Паролите нарочно не са включени.

---

## 1. FINAL STATUS

```text
TECHNICALLY READY TO UPLOAD AAB:  YES
READY FOR GOOGLE REVIEW:          NO  — липсват екранни снимки и демо STAFF акаунт
READY FOR PRODUCTION:             NO  — зависи от прегледа и от типа developer акаунт
```

Технически блокери в кода: **НЯМА**.

Предишният блокер „`/account-deletion` връща 404“ **отпадна** — Render е
деплойнал и адресът връща 200.

---

## 2. PRODUCT ARCHITECTURE

```text
One app:          bg.pizzapazzo.app — "Pizza Pazzo"
                  Едно приложение, двама потребители. Няма втори app.

Customer mode:    Начална страница · меню · категории · продукти · размери и
                  добавки · количка · доставка/вземане · checkout · поръчка ·
                  потвърждение · регистрация · вход · профил · адреси ·
                  история на поръчките · изтриване на профил
                  → държи се като нормално Android приложение

Staff/Admin mode: Всичко горното + Админ · живо табло с поръчки · приемане ·
                  отказване · детайли на поръчка · настройки на принтера ·
                  печат на кухненски бележки · повторен печат
                  → на страниците /admin: екранът остава буден, системните
                    ленти се скриват

Native features:  ESC/POS Bluetooth Classic принтерен стек (SPP/RFCOMM),
                  58/80 mm, три режима кирилица (CP866/CP1251/UTF-8),
                  mutex срещу двоен печат, auto-reconnect, тестов печат,
                  избор на сдвоен принтер, offline екран с авто-възстановяване,
                  обработка на срив на renderer процеса,
                  hand-off на tel:/mailto:/sms:/geo:/външни линкове

Web features:     Всичко останало — менюто, поръчките, профилите, админът.
                  Сървърът е source of truth за данни И за права.
```

### Как се превключва

```kotlin
// webview/StaffRoutes.kt
fun isStaffArea(url: String?): Boolean   // /admin или /en/admin, на разрешен origin
```

Извиква се при всяка навигация, включително client-side route промените на
Next.js (`doUpdateVisitedHistory`).

### Какво НЕ прави

```text
Приложението НЕ раздава права.
Приложението НЕ може да заобиколи backend авторизацията.
Проверката по URL решава само: буден екран, скрити ленти, отговаря ли
принтерният bridge. Това е допълнителен слой, не самата защита.
```

---

## 3. IDENTITY

```text
Application ID:   bg.pizzapazzo.app
Namespace:        bg.pizzapazzo.app
App name:         Pizza Pazzo
Version:          1.0.0
VersionCode:      1
minSdk:           26 (Android 8.0)
targetSdk:        36 (Android 16)
compileSdk:       36
```

Проверено в готовия APK:

```text
package: name='bg.pizzapazzo.app' versionCode='1' versionName='1.0.0'
         compileSdkVersion='36' compileSdkVersionCodename='16'
minSdkVersion:'26'
targetSdkVersion:'36'
application-label:'Pizza Pazzo'
launchable-activity: name='bg.pizzapazzo.app.MainActivity'
```

---

## 4. PACKAGE MIGRATION

```text
Old:                  pizzapazzo.kitchen
New:                  bg.pizzapazzo.app
Migration completed:  YES
```

Какво беше преместено:

| От | До |
|---|---|
| `app/src/main/java/pizzapazzo/kitchen/` | `app/src/main/java/bg/pizzapazzo/app/` |
| `app/src/test/java/pizzapazzo/kitchen/` | `app/src/test/java/bg/pizzapazzo/app/` |
| `applicationId`, `namespace` | обновени |
| package/import декларации (22 файла) | обновени |
| manifest референции | обновени |
| `proguard-rules.pro` keep правило | обновено |
| `android-kitchen-app/` | `android-app/` |
| `rootProject.name` | „Pizza Pazzo“ |

Преименувани класове и идентификатори:

| От | До | Защо |
|---|---|---|
| `KitchenApplication` | `PizzaPazzoApplication` | Приложението не е само за кухнята |
| `KitchenWebViewClient` | `SiteWebViewClient` | Обслужва целия сайт |
| `DEFAULT_KITCHEN_URL` | `DEFAULT_START_URL` | |
| `kitchenUrl` | `startUrl` | |
| `loadKitchen()` | `loadStartPage()` | |
| `Theme.PizzaPazzoKitchen` | `Theme.PizzaPazzo` | |
| `app_name` = „Pizza Pazzo Kitchen“ | „Pizza Pazzo“ | Това вижда потребителят |

### Remaining old references

```text
android-app/PLAY_STORE.md:93        migration бележка (деинсталирай старата версия)
docs/google-play-release.md:174     същата бележка
android-app/PLAY_STORE.md:67        обяснение защо CN в сертификата остава
docs/google-play-release.md:68      същото обяснение
keystore/pizzapazzo-kitchen.jks     име на файл извън git (т. 5)
CN=Pizza Pazzo Kitchen              поле в сертификата (т. 5)
"kitchen_prefs" / "kitchen_url"     вътрешни имена на SharedPreferences
```

Всички са или migration бележки, или невидими за потребителя вътрешни имена.
Нула остатъци в код, ресурси или user-facing текст.

⚠️ **Устройство със старата версия:** за Android `pizzapazzo.kitchen` е
**друго приложение**. Няма да бъде заменено при инсталация на новото —
деинсталирайте го ръчно, иначе двете стоят едно до друго.

---

## 5. SIGNING

```text
Keystore:                        android-app/keystore/pizzapazzo-kitchen.jks
Tracked in Git:                  NO (git check-ignore потвърдено)
keystore.properties:             съществува, също извън Git
Release signing:                 PASS — v2 схема
Debug подпис за release:         НЕ се използва
Hardcoded пароли:                НЯМА
Alias:                           kitchen
Алгоритъм:                       RSA 4096, SHA384withRSA
Certificate SHA-256:             90:3A:8C:08:AA:EE:08:9D:A9:15:2A:73:B2:5C:A4:05:
                                 63:03:5B:E1:7F:40:A4:E3:64:95:7C:8A:B9:A7:13:B3
Certificate validity:            24.08.2026 → 09.01.2054
Same key as before migration:    YES
```

### Защо ключът не беше сменен

Keystore-ът е независим от package name — един ключ подписва каквото и да е
приложение. Смяната на пакета не изисква нов ключ и **нов ключ не беше
генериран**.

Файлът още се казва `pizzapazzo-kitchen.jks` и сертификатът вътре носи
`CN=Pizza Pazzo Kitchen`. И двете са преценени и оставени нарочно:

- **Името на файла.** Това е най-незаменимият файл в проекта. Ако вече е
  архивиран под това име (а инструкцията от предишния одит беше точно това),
  две имена за един и същ ключ са покана за грешка при възстановяване. Печалбата
  е козметична — пътят е в gitignore и никой потребител не го вижда.
- **CN в сертификата.** Не се показва никъде. Play извежда името на разработчика
  от акаунта, не от сертификата. Промяната би означавала **нов ключ**, тоест ново
  приложение и загуба на предпазната мрежа на Play App Signing.

```text
Play App Signing recommendation:
При създаването на приложението Play предлага App Signing → ПРИЕМИ.
Google поема ключа за устройствата, нашият остава upload key и може да бъде
подменен при загуба. Това е единствената предпазна мрежа.
Статус: НЕ МОЖЕ ДА БЪДЕ ПОТВЪРДЕН — няма достъп до Play Console.
```

**Никакви пароли не се показват в този документ.**

---

## 6. RELEASE FILES

```text
AAB:
Path:     android-app/dist/pizza-pazzo-1.0.0-v1.aab
Оригинал: android-app/app/build/outputs/bundle/release/app-release.aab
Size:     5 043 496 bytes (4.81 MB)
SHA-256:  3563963531c3457572880285ca22a8baef029d18b1e0e02f76c34ec4fc272cfb
Signed:   YES

APK:
Path:     android-app/dist/pizza-pazzo-1.0.0-v1.apk
Оригинал: android-app/app/build/outputs/apk/release/app-release.apk
Size:     5 665 699 bytes (5.40 MB)
SHA-256:  e77a1feb51348c5382b36e670673a6f8754c4a7490c8ac0c8657df853e376648
Signed:   YES — apksigner "Verified using v2 scheme: true"
debuggable флаг: ОТСЪСТВА
```

Имената вече не съдържат „kitchen“. Нито един от двата не е в Git.

**Native libraries: НУЛА** — проверено с `unzip -l | grep "\.so$"`.
Следователно 64-bit и 16 KB page size изискванията са NOT APPLICABLE.

---

## 7. TESTS

```text
Web typecheck (tsc --noEmit):             PASS
Web lint (eslint . — целият проект):      PASS  (exit 0, нула съобщения)
Web i18n (490 ключа, bg/en синхрон):      PASS
Web build (next build):                   PASS  (exit 0, всички рутове)
Android lint (lintRelease):               PASS  (0 Fatal, 0 Errors, 14 Warnings)
Android unit tests (testReleaseUnitTest): PASS  (77 теста, 0 failures, 0 errors)
bundleRelease:                            PASS
assembleRelease:                          PASS
clean build от нула:                      PASS

Device customer test:                     NOT EXECUTED — NO DEVICE AVAILABLE
Device staff test:                        NOT EXECUTED — NO DEVICE AVAILABLE
Printer hardware test:                    NOT EXECUTED — NO PRINTER AVAILABLE
Browser UI test:                          NOT EXECUTED — разширението не е свързано
```

### Разбивка на тестовете

```text
bg.pizzapazzo.app.printer.EscPosPrinterServiceTest    12  (беше 12)
bg.pizzapazzo.app.printer.PrintableOrderTest          12  (беше 12)
bg.pizzapazzo.app.printer.ReceiptFormatterTest        33  (беше 33)
bg.pizzapazzo.app.webview.StaffRoutesTest             10  ← НОВ
bg.pizzapazzo.app.webview.UrlPartsTest                10  ← НОВ
                                                      ──
                                                      77   0 failures
```

Всичките 57 съществуващи теста продължават да минават. 20 нови покриват точно
това, което refactor-ът въведе:

| Тест | Какво пази |
|---|---|
| `StaffRoutesTest` | Че чужд host с път `/admin` не влиза в терминален режим и не стига до принтера; че `/administrators` не се брои за админ; че `/en/admin` се брои; че 15 клиентски страници не се броят |
| `UrlPartsTest` | Че `https://pizzapazzo.bg@evil.example.com` се чете като `evil.example.com`; че кирилски query string не чупи парсването; че невалиден вход връща null вместо да хвърли |

### Защо преди това нямаше такива тестове

`AllowedOrigins` използваше `android.net.Uri`, който на JVM е стъб — allowlist-ът,
който решава къде WebView-ът може да отиде, беше **непроверяем**. Затова
парсването е изнесено в `UrlParts` (чист Kotlin). Това е промяна в
production кода, направена, за да може решението да бъде тествано изобщо.

### Защо няма device тест

```text
$ adb devices                  → празно
$ emulator -list-avds          → празно
$ ls $SDK/system-images        → не съществува
$ ls $SDK/cmdline-tools        → празно (sdkmanager липсва → не може да се свали образ)
```

Приложението не е стартирано нито веднъж. Не твърдя обратното.

---

## 8. CUSTOMER FLOW

Проверено server-side срещу production (HTTP статуси). Клиентският път през
самото приложение не е минаван на устройство.

| Стъпка | URL | Статус |
|---|---|---|
| Home | `/` | 200 ✅ |
| Menu | `/menu` | 200 ✅ |
| Category | `/menu/<slug>` | 200 ✅ |
| Product | `/product/margarita` | 200 ✅ |
| Configuration (размери) | клиентски | NOT EXECUTED |
| Add-ons | клиентски | NOT EXECUTED |
| Cart | `/cart` | 200 ✅ |
| Checkout | `/checkout` | 200 ✅ |
| Delivery | част от checkout | NOT EXECUTED |
| Pickup | част от checkout | NOT EXECUTED |
| Register | `/auth/register` | 200 ✅ |
| Login | `/auth/login` | 200 ✅ |
| Account | `/profile` | 307 → login ✅ (middleware) |
| Order history | `/profile/orders` | 307 → login ✅ |
| Account deletion | `/account-deletion` | **200 ✅ (вече деплойнато)** |
| Deletion confirmation | `/account-deleted` | 200 ✅ |
| Order submission | — | **NOT EXECUTED — НАРОЧНО** |

Поръчка не беше подадена: това би създало истинска поръчка в production базата и
би задействало алармата в кухнята. Проектът няма test mode.

```text
Mobile viewport meta: <meta name="viewport" content="width=device-width, initial-scale=1"/>  ✅
Store status API:     /api/store-status → 200, {"isOpen":true}  ✅
```

Непроверено, защото изисква устройство: мобилна клавиатура, sticky елементи,
modals, select полета, валидация, скролиране, loading states, scroll-to-input
при checkout.

---

## 9. STAFF FLOW

| Стъпка | Статус |
|---|---|
| Staff login | Код непроменен; сървърната авторизация е недокосната |
| Admin | `/admin` → 307 към login без сесия ✅ |
| Live orders | Логика на сайта, непроменена |
| Accept | Непроменено |
| Reject | Непроменено |
| Printer settings | Отваря се от бутон в админ панела (Поръчки → На живо / Настройки на печата); плаващо колело върху страницата няма |
| Bluetooth permission | Иска се тук и само тук (т. 10) |
| Test print | Непроменено |
| Order print | Bridge методът вече изисква служебна страница (т. 12) |

```text
DEVICE STAFF TEST: NOT EXECUTED — NO DEVICE AVAILABLE
PRINTER HARDWARE TEST: NOT EXECUTED — NO PRINTER AVAILABLE
```

Нищо от служебната функционалност не е премахнато или преместено. Единствената
промяна в поведението ѝ: печатът вече отказва да работи, ако страницата не е в
`/admin` — което на практика значи, че работи точно там, където и преди.

---

## 10. BLUETOOTH

```text
Permission:                    android.permission.BLUETOOTH_CONNECT
                               + BLUETOOTH / BLUETOOTH_ADMIN (maxSdkVersion=30)
Requested on app launch:       NO
Requested only when needed:    YES
Normal customer affected:      NO
Location usage:                НИКАКВА — декларирано с neverForLocation
Device scanning:               НЕ — само вече сдвоени устройства
```

Единственото място, където разрешението се иска:

```kotlin
// settings/SettingsActivity.kt:55
binding.selectPrinterButton.setOnClickListener { requestPermissionThenPick() }
```

Тоест: **Настройки на принтера → „Избери сдвоен принтер“**. Няма друг път до
`requestPermissions` в целия source — проверено с grep за
`registerForActivityResult(RequestMultiplePermissions)` и `requestPermission`.

Това беше вече вярно преди refactor-а. Проверено, не променено.

Отказът се обработва: `pairedDevices()` връща празен списък вместо да хвърли, и
целият прочит е в един try/catch, защото четенето на `BluetoothDevice.name` също
изисква разрешението.

---

## 11. ANDROID UX

```text
Back:              Клиент И персонал: върви по историята на WebView-а; на първата
                   страница callback-ът се изключва и системата затваря
                   приложението — нормално Android поведение.
                   ПРЕДИ: moveTaskToBack(true) — приложението не можеше да бъде
                   затворено с back, което е киоск поведение.

System bars:       Клиент: видими, на място.
                   Персонал (/admin): скрити, показват се временно при плъзгане.
                   ПРЕДИ: скрити винаги, за всички.

Edge-to-edge:      Винаги включено (Android 16 го налага при targetSdk 36).
                   Съдържанието се отмества от лентите с
                   ViewCompat.setOnApplyWindowInsetsListener, за да не стои под
                   часовника или под жестовата лента.

Immersive:         Само в служебния режим.

Keep screen awake: Клиент: НЕ — екранът заспива нормално.
                   Персонал (/admin): ДА.
                   ПРЕДИ: FLAG_KEEP_SCREEN_ON беше глобален — телефонът на всеки
                   клиент щеше да стои включен, докато приложението е отворено.

Фонов режим:       Клиент: WebView-ът се приспива в onStop (пести батерия).
                   Персонал: остава да върви — таблото пита на 8 секунди и звъни
                   аларма при нова поръчка.

Phone UX:          Portrait и landscape, без заключване. Insets се уважават.
Tablet UX:         Същото; служебният режим дава целия екран на таблото.
Orientation:       Не е заключена — Android 16 така или иначе игнорира
                   заключването на екрани ≥600dp.
```

### Разликата клиент ↔ персонал, накратко

| | Клиент | Персонал |
|---|---|---|
| Системни ленти | видими | скрити |
| Екранът заспива | да | не |
| Back на първа страница | излиза | излиза |
| WebView във фон | приспива се | върви (алармата) |
| Bluetooth диалог | никога | при избор на принтер |

---

## 12. SECURITY

```text
HTTPS:                    Само. Release network config: base cleartext=false,
                          без изключения
Cleartext:                Невъзможен в release — dev изключенията живеят в
                          src/debug и не се merge-ват
WebView debugging:        setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
                          → false в release
SSL bypass:               НЯМА. onReceivedSslError вика handler.cancel() изрично
Mixed content:            MIXED_CONTENT_NEVER_ALLOW
Origin allowlist:         pizza-pazzo.onrender.com, pizzapazzo.bg,
                          www.pizzapazzo.bg (+ dev хостове само в debug)
JS bridge:                origin re-check при всяко извикване, срещу committed
                          URL; печатът допълнително изисква служебна страница
External URLs:            tel/mailto/sms/geo/http/https → системата
                          intent:/javascript:/data:/file:/content: → блокирани
Hardcoded secrets:        НЯМА
Backup:                   allowBackup=false + dataExtractionRules
                          (спира и device-to-device прехвърляне)
allowFileAccess:          false
allowContentAccess:       false
Third-party cookies:      изключени
Multiple windows:         изключени
```

### Ново от този refactor

**Печатът е ограничен до служебните страници.**

```kotlin
private fun staffAreaAllowed(): Boolean =
    originAllowed() && StaffRoutes.isStaffArea(webViewClient.lastCommittedUrl)
```

Прилага се за `printOrder`, `printTestPage`, `openPrinterSettings`,
`disconnectPrinter`. `isAvailable` и `getPrinterStatus` остават на само origin
проверка — клиентските страници и без това не питат, а честният отговор „няма
принтер тук“ е по-добър от изключение.

Това **не е авторизацията**. Данните за поръчка стигат до bridge-а само защото
сървърът вече ги е дал на страница, която е оторизирал. Route проверката значи,
че клиентска страница няма изобщо път до принтера — дори да бъде компрометирана.

**Парсването на URL е закалено.**

`UrlParts` заменя `android.net.Uri` в решенията за сигурност:

- никога не хвърля — невалиден вход дава `null`, а всеки викащ третира `null`
  като „не е разрешено“;
- реже userinfo, така че `https://pizzapazzo.bg@evil.example.com/` се чете като
  `evil.example.com` (тествано);
- не е `java.net.URI`, който хвърля на вход, който WebView-ът приема спокойно
  (кирилски query string) — а парсер, който хвърля, превръща легитимна страница
  в блокирана навигация.

---

## 13. DATA SAFETY

Приложението **само по себе си** не събира нищо: няма аналитика (проверено с
grep за GA4/GTM/Meta Pixel/Firebase/Sentry/Clarity/Matomo/PostHog/Plausible —
нула попадения), няма реклами, няма Advertising ID, няма SDK-та на трети страни.

Но през него се прави поръчка и се създава профил, а Google смята данните,
въведени в WebView вътре в приложение, за събрани **от приложението**.

**„Does your app collect or share any of the required user data types?“ → Yes**

| Data | Collected | Shared | Purpose | Required | Encrypted | Deletion | Evidence |
|---|---|---|---|---|---|---|---|
| Personal info → **Name** | YES | NO | App functionality | Required | YES | YES | `prisma/schema.prisma` (Order, User) |
| Personal info → **Email** | YES | NO | App functionality | Required | YES | YES | `User.email`, `Order` |
| Personal info → **Phone** | YES | NO | App functionality | Required | YES | YES | `User.phone`, `Order` |
| Personal info → **Address** | YES | NO | App functionality | Optional (само доставка) | YES | YES | `UserAddress`, `Order` |
| App activity → **Purchase history** | YES | NO | App functionality | Required | YES | YES | `Order.userId` |
| Personal info → Password | NO¹ | NO | — | — | YES | YES | bcrypt в `lib/auth/password.ts` |
| Location | NO | NO | — | — | — | — | няма location разрешение |
| Financial info | NO | NO | — | — | — | — | плащане при доставка |
| Device or other IDs | NO | NO | — | — | — | — | няма AD_ID |
| Advertising ID | NO | NO | — | — | — | — | не се декларира |
| Crash logs | NO | NO | — | — | — | — | няма crash reporting |
| Diagnostics | NO | NO | — | — | — | — | няма аналитика |
| Photos / Videos / Audio | NO | NO | — | — | — | — | няма разрешения |
| Contacts / Calendar / SMS | NO | NO | — | — | — | — | няма разрешения |
| Health & fitness | NO | NO | — | — | — | — | — |
| Web browsing history | NO | NO | — | — | — | — | — |
| Files & docs | NO | NO | — | — | — | — | — |

¹ Google третира паролата като част от „Personal info“; не се декларира
отделно и не се пази в четим вид.

**Shared = NO навсякъде.** Данните отиват само към собствения сървър (Render —
инфраструктура) и към Resend за имейла за потвърждение (процесор по договор).
Google не третира нито едното като „споделяне“.

```text
„Is all of the user data collected by your app encrypted in transit?“ → Yes
„Do you provide a way for users to request that their data is deleted?“ → Yes
Data deletion URL: https://pizza-pazzo.onrender.com/account-deletion
```

**Bluetooth не е данна и не се декларира в Data safety.** Ако рецензент попита:
използва се само за връзка с вече сдвоен принтер, не се сканира, не се извлича
местоположение, и клиентът никога не бива питан за него.

### Неизвестни, за които трябва потвърждение

```text
UNKNOWN 1: Точният срок на съхранение на поръчките (5 или 10 г.)
           → счетоводителят. Влиза в Политиката за поверителност, не в Data safety.
UNKNOWN 2: Подписан ли е DPA с Resend
           → акаунтът на Resend. GDPR изискване, Google не пита.
UNKNOWN 3: Съдържа ли менюто алкохол
           → влияе на content rating и target audience (т. 16)
```

---

## 14. PRIVACY

```text
Privacy URL:              https://pizza-pazzo.onrender.com/app-privacy   → 200 ✅
Deletion URL:             https://pizza-pazzo.onrender.com/account-deletion → 200 ✅
Package named correctly:  YES — политиката казва „пакет bg.pizzapazzo.app“
App name correct:         YES — „Pizza Pazzo“, без „Kitchen“
Customer data covered:    YES — поръчка, регистрация, история, сървърни логове
Staff Bluetooth covered:  YES — отделен раздел
```

⚠️ **Не подавайте адрес на pizzapazzo.bg.** Домейнът още сочи стария сайт
(nginx/1.12.2) и връща 200 за **всеки** път, включително несъществуващ — тоест
`www.pizzapazzo.bg/app-privacy` „се отваря“, но не показва политиката. Google
проверява съдържанието.

### Какво беше пренаписано

Политиката описваше „служебен инструмент за персонала… на кухненския таблет“.
Сега описва приложението такова, каквото е:

- клиентът е основният потребител, поръчката и профилът са основната тема;
- служебната част и печатът са отделен раздел, не заглавието;
- изрично е записано, че **Bluetooth не се иска при стартиране и не е нужен, за
  да поръчате** — точно защото това е единственото разрешение, което приложението
  изобщо би поискало;
- добавен раздел за деца (приложение за поръчка на храна, не е насочено към
  деца, не събира съзнателно данни от лица под 16);
- изтриването на профил сочи и към пътя в приложението, и към публичната
  страница.

---

## 15. PLAY STORE LISTING

### BG

**App name** (11/30):

```
Pizza Pazzo
```

**Short description** (72/80):

```
Разгледай менюто и поръчай любимата си пица от Pizza Pazzo, Плевен.
```

**Full description:**

```
Pizza Pazzo е официалното приложение на пицария Pizza Pazzo в Плевен. С него
разглеждате менюто, съставяте поръчката си и я изпращате за няколко минути —
без обаждане и без чакане на линия.

МЕНЮТО
• Пълното меню на заведението, със снимки, описания и актуални цени.
• Подредено по категории, за да намирате бързо.
• Всеки продукт с неговите размери и варианти.

ПОРЪЧКАТА
• Избирате размер и добавки към всяко ястие.
• Количката пази избора ви, докато решите.
• Доставка или вземане от място.
• Виждате сумата преди да потвърдите — без изненади накрая.

ПРОФИЛ
• Запазвате адресите си, за да не ги пишете всеки път.
• Историята на поръчките ви е под ръка.
• Профилът може да бъде изтрит по всяко време от самото приложение.

ЗАВЕДЕНИЕТО
Работно време, телефон и адрес — винаги налични в приложението. Ако кухнята е
затворена, приложението ви казва кога отваря отново, вместо да приема поръчка,
която няма кой да приготви.

Приложението няма реклами, няма проследяване и не изпраща данни към трети
страни.

Приложението се използва и от персонала на заведението за приемане на поръчки.
Служебната част е достъпна само със служебен акаунт.
```

### EN

**App name** (11/30):

```
Pizza Pazzo
```

**Short description** (71/80):

```
Browse the menu and order your favourite pizza from Pizza Pazzo, Pleven.
```

**Full description:**

```
Pizza Pazzo is the official app of the Pizza Pazzo pizzeria in Pleven, Bulgaria.
Browse the menu, put your order together and send it in a couple of minutes — no
phone call, no waiting on hold.

THE MENU
• The restaurant's full menu, with photos, descriptions and current prices.
• Organised by category so you find things quickly.
• Every dish with its sizes and variants.

ORDERING
• Choose the size and the add-ons for each dish.
• The cart keeps your choices until you are ready.
• Delivery or pickup.
• You see the total before you confirm — no surprises at the end.

YOUR ACCOUNT
• Save your addresses so you do not retype them every time.
• Your order history stays within reach.
• The account can be deleted at any time from inside the app.

THE RESTAURANT
Opening hours, phone number and address are always in the app. If the kitchen is
closed, the app tells you when it opens again instead of taking an order nobody
can cook.

No ads, no tracking, no data sent to third parties.

The app is also used by restaurant staff to take orders. The staff area requires
a staff account.
```

Нито един ред не описва функционалност, която приложението няма — всяко
твърдение е сверено с кода. Изразът „не е предназначено за клиенти“ е премахнат
навсякъде.

---

## 16. CATEGORY / AUDIENCE

```text
Category:                        Food & Drink
Target audience:                 13+  (16+ или 18+, ако менюто съдържа алкохол)
Designed for children:           NO
Content rating recommendation:   PEGI 3 / Everyone, при отговори „Не“ на всичко
Alcohol impact:                  ⚠️ ПРОВЕРИ МЕНЮТО — виж отдолу
```

### Защо Food & Drink, а не Business

Предишният одит препоръчваше **Business**, защото приложението беше служебен
инструмент и рецензент, попаднал на Food & Drink приложение с екран за вход, би
търсил клиентски поток и не би го намерил.

Това вече не важи. Приложението **е** приложение за поръчка на храна — менюто,
количката и поръчката работят без никакъв вход. Food & Drink е честното място за
него, а Business би бил подвеждащ.

### Content rating — отговори

```text
Насилие                                   НЕ
Сексуално съдържание                      НЕ
Ругатни                                   НЕ
Наркотици                                 НЕ
Хазарт                                    НЕ
Съдържание от потребители                 НЕ (бележките към поръчката се виждат
                                          само от персонала, не се публикуват)
Споделяне на местоположение                НЕ
Споделяне на лични данни с трети страни    НЕ
Нерестриктиран достъп до интернет          НЕ (WebView е заключен към allowlist)
Покупки в приложението                     НЕ (плаща се при доставка/на място)
Алкохол / тютюн                           ⚠️ ЗАВИСИ ОТ МЕНЮТО
```

```text
⚠️ UNKNOWN — OWNER CONFIRMATION REQUIRED
Ако в менюто се продава бира или вино, отговорът на „Препраща ли към алкохол“
е ДА, рейтингът се вдига и възрастовата група трябва да се качи съответно.
Не мога да отговоря вместо вас — зависи от текущото меню.
Невярно попълнен IARC въпросник е основание за сваляне на приложението.
```

### Защо не 18+ по подразбиране

Предишният одит слагаше 18+, защото приложението беше служебен инструмент.
Приложение за поръчка на храна няма причина да е 18+, освен ако не се продава
алкохол. 13+ е разумната стойност, а „designed for children“ остава НЕ — така
Families policy не се задейства.

---

## 17. PLAY APP CONTENT

Точни стойности за Play Console:

| Раздел | Стойност |
|---|---|
| **Privacy policy** | `https://pizza-pazzo.onrender.com/app-privacy` |
| **Ads** | Не, приложението не съдържа реклами |
| **App access** | „All or some functionality is restricted“ + текстът от т. 19 |
| **Content rating** | IARC въпросник по т. 16 |
| **Target audience** | 13+ (или по-високо при алкохол); designed for children = NO |
| **Data safety** | **Yes, събира данни** — таблицата от т. 13 + deletion URL |
| **Government apps** | NOT APPLICABLE |
| **Financial features** | Никаква не се маркира |
| **Health** | NOT APPLICABLE |
| **News** | NOT APPLICABLE |
| **Advertising ID** | Не се използва |
| **Google Play Billing** | **НЕ се изисква** — физическа храна с доставка е изрично изключена от политиката за плащания. Дори при бъдещо онлайн плащане то би минало през обикновен платежен доставчик |
| **64-bit** | NOT APPLICABLE — няма native код |
| **16 KB page size** | NOT APPLICABLE — няма native код |
| **Foreground services** | NOT APPLICABLE |
| **Notifications** | NOT APPLICABLE — няма POST_NOTIFICATIONS; push не е реализиран и не е нужен за v1 |
| **Exact alarms** | NOT APPLICABLE |
| **Photo/video permissions** | NOT APPLICABLE |
| **Location permissions** | NOT APPLICABLE |
| **Play Integrity** | NOT REQUIRED — няма плащания в приложението |

---

## 18. ASSETS

| Asset | Required | Dimensions | Status | File |
|---|---|---|---|---|
| Icon | **Задължителен** | 512×512 PNG, без alpha | ✅ **ГОТОВ** | `android-app/play-assets/play-icon-512.png` |
| Feature graphic | **Задължителен** | 1024×500 PNG, без alpha | ✅ **ГОТОВ** | `android-app/play-assets/play-feature-graphic-1024x500.png` |
| Phone screenshots | **Задължителен**, мин. 2 | 320–3840 px/страна, ≤2:1 | ❌ **ЛИПСВА** | — |
| Tablet screenshots (7" и 10") | Препоръчителен | същите правила | ❌ **ЛИПСВА** | — |
| Launcher icon | Задължителен | adaptive, 5 плътности | ✅ **ГОТОВ** | `app/src/main/res/mipmap-*/` |
| Promo video | По избор | YouTube | Не се прави | — |

Иконата и feature graphic-ът са регенерирани след refactor-а (`npm run icons:play`).
И двете са реалното лого на заведението върху брандовия крем фон — **никакво
измислено ново branding**. Иконата не подсказва по никакъв начин, че приложението
е кухненски терминал.

```text
ASSET REQUIRED: Екранни снимки
Формат:    PNG или JPEG, без прозрачност
Размер:    всяка страна 320–3840 px; по-дългата ≤ 2× по-късата
Отива в:   Store listing → Graphics → Phone / 7-inch tablet / 10-inch tablet
Защо липсва: Play изисква реални екрани от приложението. Нарисувани или
           сглобени са нарушение на политиката за листинга — затова не са
           направени и не бива да се добавят такива.
```

Планът е в `android-app/play-assets/README.md`, **клиентските екрани са
приоритетни**: начална страница, меню, продукт с добавки, количка, checkout,
потвърждение. Служебното табло е по избор и никога първа снимка.

---

## 19. APP ACCESS TEXT

Готов за copy/paste в Play Console → App content → App access:

```
Приложението е за поръчка на храна от пицария Pizza Pazzo.

БЕЗ ВХОД (по-голямата част от приложението):
Менюто, категориите, продуктите, количката, доставка/вземане и подаването на
поръчка работят изцяло без регистрация. Може да се тества веднага след
стартиране.

С КЛИЕНТСКИ ПРОФИЛ:
Регистрацията е свободна и отнема секунди — запазени адреси, история на
поръчките и изтриване на профила.

СЛУЖЕБНА ЧАСТ (ограничена):
Таблото с поръчките и печатът са само за персонала на заведението.
Демо служебен акаунт:
  имейл: <демо имейл>
  парола: <демо парола>
След вход отвори „Админ → Поръчки → На живо“.

Печатът на бележки изисква сдвоен Bluetooth термален принтер, какъвто на
тестово устройство няма — бутонът ще каже, че принтер не е избран. Това е
очакваното поведение без хардуер. Разрешението за Bluetooth се иска само в
служебния екран за настройки на принтера, никога при стартиране.
```

```text
⚠️ Демо акаунтът трябва да бъде създаден преди подаването:
   Админ → Потребители → нов потребител, роля STAFF (НЕ ADMIN).
   Парола, използвана само за Google.
   Никакви production credentials не са записани в repository-то или в този документ.
```

---

## 20. MANUAL DEVICE TESTS

Нищо от следното не е изпълнено. Това е точният списък, който трябва да се мине
на устройство.

### Клиентски тест (телефон)

```text
□  Инсталирай android-app/dist/pizza-pazzo-1.0.0-v1.apk
□  Ако има стара версия (пакет pizzapazzo.kitchen) — деинсталирай я първо
□  Отвори приложението
□  ПРОВЕРИ: НЕ се появява диалог за Bluetooth        ← критично
□  ПРОВЕРИ: статус лентата и жестовата лента се виждат
□  ПРОВЕРИ: съдържанието не стои под часовника
□  ПРОВЕРИ: екранът заспива нормално (изчакай timeout-а)
□  Разгледай менюто → отвори категория → отвори продукт
□  Избери размер и добавки
□  Добави в количката
□  Отвори количката, провери сумата
□  Checkout: избери доставка, попълни адрес
□  ПРОВЕРИ: клавиатурата не крие полето, което пишеш
□  ПРОВЕРИ: полето за телефон отваря цифрова клавиатура
□  Регистрирай ТЕСТОВ профил
□  Подай ТЕСТОВА поръчка (уговори се с кухнята предварително)
□  Провери потвърждението
□  Отвори профила → история на поръчките
□  Излез → влез отново → ПРОВЕРИ: сесията се помни
□  Back от продукт → връща в категорията
□  Back от началната страница → приложението се затваря  ← критично
□  Изключи Wi-Fi → ПРОВЕРИ: брандиран offline екран с „Опитай отново“
□  Включи Wi-Fi → ПРОВЕРИ: страницата се зарежда сама
□  Профил → Изтриване на профила → изтрий ТЕСТОВИЯ профил
□  ПРОВЕРИ: пренасочва към /account-deleted
```

### Служебен тест (таблет + принтер)

```text
□  Влез със STAFF акаунт
□  Отвори Админ → Поръчки → На живо
□  ПРОВЕРИ: системните ленти се скриват                ← режимът се сменя тук
□  ПРОВЕРИ: екранът НЕ заспива (изчакай timeout-а)
□  Излез от /admin към менюто
□  ПРОВЕРИ: лентите се връщат, екранът пак заспива     ← критично
□  Върни се в /admin, отвори настройките на принтера (бутон „Настройки на принтера“)
□  Натисни „Избери сдвоен принтер“
□  ПРОВЕРИ: ЕДВА СЕГА се появява диалогът за Bluetooth ← критично
□  Разреши, избери сдвоения принтер
□  „Тест на връзката“ → статус „Свързан“
□  „Тестов печат“ → ПРОВЕРИ: кирилицата се чете
□  Ако не се чете: смени кодировката (CP866 ↔ CP1251) и повтори
□  Върни се на таблото, приеми тестова поръчка
□  Натисни „ПРИНТИРАЙ ПОРЪЧКАТА“
□  ПРОВЕРИ: бележката излиза правилно, не се реже по средата
□  Натисни отново → ПРОВЕРИ: отбелязано е „ПОВТОРЕН ПЕЧАТ“
□  Отвори менюто (клиентска страница) и опитай да печаташ
□  ПРОВЕРИ: бутонът за печат не се появява там         ← новото ограничение
```

---

## 21. REMAINING BLOCKERS

```text
╔════════════════════════════════════════════════════════════════════════╗
║ BLOCKER 1: Липсват екранни снимки                                      ║
╠════════════════════════════════════════════════════════════════════════╣
║ Severity:     ВИСОКА — Play не пуска листинг без минимум 2             ║
║ Exact fix:    Планът в android-app/play-assets/README.md, на реално    ║
║               устройство. Клиентските екрани първи.                    ║
║ Owner action: Инсталирай APK-то и снимай 4–6 екрана                    ║
╚════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════╗
║ BLOCKER 2: Липсва демо STAFF акаунт за „App access“                    ║
╠════════════════════════════════════════════════════════════════════════╣
║ Severity:     ВИСОКА — най-честата причина за отхвърляне               ║
║ Exact fix:    Админ → Потребители → нов потребител, роля STAFF         ║
║ Owner action: Създай го и попълни данните в текста от т. 19            ║
╚════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════╗
║ BLOCKER 3: Приложението не е стартирано на устройство                  ║
╠════════════════════════════════════════════════════════════════════════╣
║ Severity:     СРЕДНА — не спира качването, но никой не е видял, че     ║
║               работи. Refactor-ът смени режима на екрана и back        ║
║               навигацията — точно нещата, които се виждат само на живо ║
║ Exact fix:    Чеклистът в т. 20                                        ║
║ Owner action: Мини и двата теста                                       ║
╚════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════╗
║ BLOCKER 4: Production достъп при личен developer акаунт                ║
╠════════════════════════════════════════════════════════════════════════╣
║ Severity:     СРЕДНА — забавяне, не спиране                            ║
║ Reason:       Лични акаунти, създадени след 13.11.2023, минават closed ║
║               test с 12 тестера × 14 поредни дни преди Production.     ║
║               Организационните акаунти нямат това изискване в          ║
║               документацията на Google.                                ║
║ Exact fix:    Регистрирай акаунта като ОРГАНИЗАЦИЯ при създаването —   ║
║               типът не се сменя после                                  ║
║ Owner action: При регистрацията                                        ║
╚════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════╗
║ BLOCKER 5: Въпросът за алкохол в IARC не е отговорен                   ║
╠════════════════════════════════════════════════════════════════════════╣
║ Severity:     СРЕДНА — невярно попълнен въпросник е основание за       ║
║               сваляне на приложението                                  ║
║ Exact fix:    Провери менюто за бира и вино; ако има — отговори ДА и   ║
║               качи възрастовата група                                  ║
║ Owner action: Преди попълване на Content rating                        ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Технически блокери в кода: НЯМА.**

**Отпаднал от предишния одит:** `/account-deletion` вече връща 200 — Render е
деплойнал.

---

## 22. FILES CHANGED

73 файла, +1348 / −677.

### Package миграция

| Файл | Промяна |
|---|---|
| `android-kitchen-app/` → `android-app/` | Преименувана директория |
| `app/src/main/java/pizzapazzo/kitchen/` → `bg/pizzapazzo/app/` | Преместени 19 source файла |
| `app/src/test/java/pizzapazzo/kitchen/` → `bg/pizzapazzo/app/` | Преместени 3 test файла |
| `app/build.gradle.kts` | `applicationId`, `namespace`; `kotlinOptions` → `compilerOptions` DSL |
| `settings.gradle.kts` | `rootProject.name` = „Pizza Pazzo“ |
| `app/proguard-rules.pro` | Keep правило за новия пакет |
| `AndroidManifest.xml` | `.PizzaPazzoApplication`, `Theme.PizzaPazzo` |

### Идентичност

| Файл | Промяна |
|---|---|
| `res/values/strings.xml` | `app_name` → „Pizza Pazzo“; offline текстът вече не говори за таблет; блокираният линк вече не споменава „кухненското приложение“ |
| `res/values/themes.xml` | `Theme.PizzaPazzoKitchen` → `Theme.PizzaPazzo` |
| `KitchenApplication.kt` → `PizzaPazzoApplication.kt` | Преименуван клас |
| `bluetooth/BluetoothPrinterManager.kt` | „настройките на таблета“ → „системните настройки на устройството“ |

### Клиентски UX

| Файл | Промяна |
|---|---|
| `MainActivity.kt` | Премахнати глобалните `FLAG_KEEP_SCREEN_ON` и immersive режим; добавени `applyScreenModeFor` (по URL), `applyWindowInsets` (edge-to-edge padding), route-aware back callback, `onStart`/`onStop` (клиентският WebView се приспива във фон, служебният не) |
| `webview/StaffRoutes.kt` | **НОВ** — клиентска или служебна страница, по URL |
| `webview/UrlParts.kt` | **НОВ** — чист Kotlin парсер, за да са тестваеми решенията за сигурност |
| `webview/SiteWebViewClient.kt` | Преименуван от `KitchenWebViewClient`; нов `onNavigated` callback, който хваща и client-side route промените |
| `webview/AllowedOrigins.kt` | Мигриран от `android.net.Uri` към `UrlParts`; нов `isAllowed(parts)` за еднократно парсване |
| `webview/JavascriptBridge.kt` | Печатът вече изисква служебна страница (`staffAreaAllowed`) |
| `settings/PrinterPreferences.kt` | `kitchenUrl` → `startUrl` и свързаните константи |

### Тестове

| Файл | Промяна |
|---|---|
| `webview/StaffRoutesTest.kt` | **НОВ** — 10 теста |
| `webview/UrlPartsTest.kt` | **НОВ** — 10 теста |

### Сайт

| Файл | Промяна |
|---|---|
| `content/legal/appPrivacy.ts` | **Пренаписан** — клиентско приложение, нов пакет, Bluetooth разделът обяснява, че клиент не бива питан, нов раздел за деца, изтриване сочи и двата пътя |
| `content/legal/accountDeletion.ts` | „Pizza Pazzo Kitchen“ → „Pizza Pazzo“ |
| `messages/bg.json`, `messages/en.json` | Meta описания за новата идентичност |
| `lib/android-printer.ts` | Коментари: не е „kitchen app“ |
| `components/admin/PrintOrderButton.tsx` | Коментар |
| `app/[locale]/app-privacy/page.tsx` | Коментар |
| `eslint.config.mjs` | Нов път в ignore |
| `scripts/generate-android-icons.mjs`, `scripts/generate-play-assets.mjs` | Нов път |

### Документация

| Файл | Промяна |
|---|---|
| `android-app/README.md` | Пренаписано начало: едно приложение, два режима, модел на сигурността, Bluetooth timing |
| `android-app/PLAY_STORE.md` | **Пренаписан** — клиентски листинг, Food & Drink, 13+, нов App access текст, обяснение защо ключът не се сменя |
| `android-app/play-assets/README.md` | Screenshot планът е клиентски |
| `docs/google-play-release.md` | Нов раздел 0 (архитектура и модел на сигурността); предупреждение за стария пакет |
| `docs/google-play-release-audit.md` | **НОВ** — този документ |

### Какво НЕ беше пипано

```text
✗ backend логика          ✗ ordering logic       ✗ Prisma schema
✗ kitchen system          ✗ админ панел          ✗ отчети
✗ данни за продуктите     ✗ автентикация         ✗ имейли
✗ Render конфигурация     ✗ съществуващи API-та  ✗ Bluetooth печатен стек
```

---

## 23. GIT

```text
Branch:         master
Commit:         3aabcd0  feat(android): turn Pizza Pazzo into unified customer and staff app
Предходен:      722bf95  chore(android): prepare the production Google Play release
Pushed:         YES → origin
Working tree:   clean
Force push:     NO
```

Проверка за тайни преди commit:

```bash
git diff --cached --name-only | grep -iE "keystore|\.jks$|\.aab$|\.apk$|local\.properties"
# нула попадения
```

---

## 24. FINAL VERDICT

```text
ONE UNIFIED APP: YES

CUSTOMER APP EXPERIENCE READY: YES

STAFF/ADMIN EXPERIENCE PRESERVED: YES

BLUETOOTH PRINTING PRESERVED: YES

NORMAL CUSTOMER IS NOT ASKED FOR BLUETOOTH ON STARTUP: YES

TECHNICALLY READY TO UPLOAD AAB: YES

READY TO SUBMIT TO GOOGLE REVIEW: NO

READY FOR PRODUCTION: NO

REMAINING OWNER ACTIONS:
1. Архивирай keystore-а на две места извън компютъра — ако още не е направено.
2. Регистрирай Play developer акаунт като ОРГАНИЗАЦИЯ (спестява 12 тестера × 14 дни).
3. Създай демо STAFF акаунт и попълни данните в текста за App access.
4. Инсталирай APK-то и мини клиентския и служебния чеклист от т. 20.
5. Направи 4–6 екранни снимки — клиентските екрани първи.
6. Провери менюто за алкохол преди да попълниш Content rating.
7. Деинсталирай старата версия (pizzapazzo.kitchen) от кухненския таблет.
```

---

## Приложение: команди за независима проверка

```bash
cd "C:\Users\The King\Desktop\Sites\08. Pizza Pazzo\android-app"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
SDK="/c/Users/The King/AppData/Local/Android/Sdk"

# Пълен build от нула
./gradlew clean lintRelease testReleaseUnitTest bundleRelease assembleRelease

# Package name и име в системата
"$SDK/build-tools/36.0.0/aapt2.exe" dump badging \
  app/build/outputs/apk/release/app-release.apk | head -6

# Подпис
"$SDK/build-tools/36.0.0/apksigner.bat" verify --print-certs \
  app/build/outputs/apk/release/app-release.apk

# Native код (трябва да е празно)
unzip -l app/build/outputs/bundle/release/app-release.aab | grep "\.so$"

# Тестове
grep -ho 'tests="[0-9]*" failures="[0-9]*"' app/build/test-results/testReleaseUnitTest/*.xml

# Lint грешки (трябва да е 0)
grep -cE "^C:.*: Error:" \
  app/build/intermediates/lint_intermediate_text_report/release/lintReportRelease/lint-results-release.txt

# Къде се иска Bluetooth разрешение (трябва да е само SettingsActivity)
grep -rn "RequestMultiplePermissions\|requestPermission" app/src/main/java/

# Остатъци от стария пакет (само migration бележки в .md)
grep -rn "pizzapazzo\.kitchen" --include=*.kt --include=*.xml --include=*.kts app/

# Сайт
cd ..
npm run type-check && npm run check:i18n && npm run lint && npm run build

# Production
for p in / /menu /app-privacy /account-deletion /cart /checkout; do
  printf "%s  %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "https://pizza-pazzo.onrender.com$p")" "$p"
done
```
