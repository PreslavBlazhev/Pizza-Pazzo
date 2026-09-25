# Качване на „Pizza Pazzo“ в Google Play

Наръчник за публикуването. Всичко, което зависи от кода, е готово — остават
стъпките, които се правят от Play Console с акаунт на клиента.

---

## 0. Какво представлява приложението

**Едно приложение, двама потребители.**

| | Клиент | Персонал |
|---|---|---|
| Как стига дотам | Сваля от Google Play | Същото приложение, влиза със служебен акаунт |
| Какво вижда | Меню, продукти, количка, поръчка, профил, история | Всичко горното + Админ → живо табло, приемане, печат |
| Какво прави приложението различно | Нищо особено — държи се като нормално Android приложение | На страниците `/admin` екранът не заспива и системните ленти се скриват |
| Bluetooth | **Никога не му се иска** | Иска се при „Избери сдвоен принтер“ |

Кой какво може да види решава **сървърът**, от сесийната бисквитка. Приложението
не раздава права и не може да ги заобиколи — то само променя как изглежда
екранът, когато URL-ът е в `/admin`.

Нативната част, която прави приложението повече от обвивка около сайт: пълен
ESC/POS Bluetooth принтерен стек (58/80 mm, три режима кирилица, mutex срещу
двоен печат, auto-reconnect).

## 1. Какво вече е готово в кода

- ✅ `applicationId` = `bg.pizzapazzo.app`, име в системата **Pizza Pazzo**
- ✅ `targetSdk`/`compileSdk` = 36 (Play изисква API 36 за нови приложения от
  **31 август 2026 г.**)
- ✅ `minSdk` = 26 (Android 8.0)
- ✅ Подписан **release AAB** — единственият формат, който Play приема
- ✅ Release keystore извън git (т. 2)
- ✅ Клиентско поведение по подразбиране: edge-to-edge, системни ленти на място,
  екранът заспива нормално, back излиза от приложението както навсякъде
- ✅ Bluetooth разрешението **не** се иска при стартиране
- ✅ Печатът работи само на служебните страници (defence in depth)
- ✅ HTTPS-only release; dev изключенията живеят само в `src/debug`
- ✅ `allowBackup=false` + `dataExtractionRules` — сесията не изтича в облак
- ✅ Няма реклами, аналитика, Advertising ID или SDK на трети страни
- ✅ Изтриване на профил — в приложението и на публичен адрес (т. 7)
- ✅ Няма native код → 64-bit и 16 KB изискванията не важат
- ✅ Android lint (release): 0 грешки. 77 unit теста минават.
- ✅ Иконка 512×512 и feature graphic 1024×500 в `play-assets/`

## 2. Ключът за подписване

```
android-app/keystore/pizzapazzo-kitchen.jks   ← самият ключ
android-app/keystore.properties               ← пътят + паролите
```

И двата са в `.gitignore` и **никога не влизат в git**.

> **Загубиш ли този ключ, приложението не може да бъде обновявано никога повече.**

Направи **сега**: копирай и двата файла на поне две места извън компютъра, и
запиши паролата отделно в мениджър на пароли.

**Защо файлът още се казва `pizzapazzo-kitchen.jks`:** името е от времето,
когато приложението беше само за кухнята. Не е преименувано нарочно. Това е
най-незаменимият файл в проекта; ако вече е архивиран под това име, две имена за
един и същ ключ са покана за грешка при възстановяване. Името е в gitignore-нат
път, никой потребител не го вижда, и Play се интересува само от отпечатъка.

По същата причина сертификатът вътре още носи `CN=Pizza Pazzo Kitchen`. И това
не се вижда никъде — Play показва името на разработчика от акаунта, не полето в
сертификата. Смяната би означавала **нов ключ**, тоест ново приложение.

**SHA-256 на сертификата:**
`90:3A:8C:08:AA:EE:08:9D:A9:15:2A:73:B2:5C:A4:05:63:03:5B:E1:7F:40:A4:E3:64:95:7C:8A:B9:A7:13:B3`

При качването Play предлага **Play App Signing** — приеми. Тогава Google държи
ключа за устройствата, а нашият остава само upload key и може да бъде подменен,
ако се загуби. Това е единствената предпазна мрежа.

## 3. Build

```
cd android-app
gradlew.bat bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab
gradlew.bat assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

Копия с говорещи имена: `android-app/dist/pizza-pazzo-1.0.2-v3.aab` и `.apk`
(папката е извън git).

При всяко следващо качване **`versionCode` в `app/build.gradle.kts` трябва да се
увеличи**. Play отказва повтаряща се стойност завинаги.

⚠️ Ако на кухненския таблет има инсталирана стара версия с пакет
`pizzapazzo.kitchen`, тя е **друго приложение** за Android. Деинсталирай я
ръчно, иначе двете ще стоят една до друга.

## 4. Регистрация на акаунт

- https://play.google.com/console → еднократна такса 25 USD
- Тип: **Организация** (на Pizza Pazzo LTD), ако е възможно — виж т. 12
- Проверка на самоличността: 2 дни до 2 седмици. Започни я веднага.

## 5. Политика за поверителност (задължителна)

```
https://pizza-pazzo.onrender.com/app-privacy
```

⚠️ **Не слагай адрес на pizzapazzo.bg.** Проверено: домейнът все още сочи стария
сайт (nginx) и връща 200 за всеки път, включително несъществуващ. Google
проверява съдържанието — това би провалило прегледа.

Текстът е в `content/legal/appPrivacy.ts`.

## 6. Play Console → „App content“

| Раздел | Какво да се попълни |
|---|---|
| **Privacy policy** | Адресът от т. 5 |
| **Ads** | Няма реклами |
| **App access** | „All or some functionality is restricted“ + текстът от т. 9 |
| **Content ratings** | IARC въпросник — т. 10 |
| **Target audience** | 13+ (или 16+/18+ при алкохол) — т. 11 |
| **News app** | Не |
| **COVID-19** | Не |
| **Data safety** | **Yes, събира данни** — т. 7. Не отговаряй „No“ |
| **Government apps** | Не |
| **Financial features** | Никаква. Плащането е в брой при доставка, стоката е физическа → **Google Play Billing не се изисква** |
| **Health** | Не |
| **Advertising ID** | Не се използва |

## 7. Data safety — точните отговори

Приложението **само по себе си** не събира нищо — няма аналитика, реклами или
SDK-та. Но през него се прави поръчка и се създава профил, а Google смята
данните, въведени в WebView вътре в приложение, за събрани **от него**.

**„Does your app collect or share any of the required user data types?“ → Yes**

Категориите по-долу са точните имена от формата на Google. Отметни **само**
тези редове — всеки излишен „Yes“ е също толкова невярна декларация, колкото
липсващ.

| Data type | Collected | Shared | Purpose | Required | Какво е това у нас |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | App functionality | Required | Име при поръчка и при регистрация |
| Personal info → **Email address** | Yes | No | App functionality | Required | Имейл за потвърждение + вход в профила |
| Personal info → **Phone number** | Yes | No | App functionality | Required | Телефон за връзка при доставка |
| Personal info → **Address** | Yes | No | App functionality | Required | Адрес за доставка (единственият начин на изпълнение) |
| Personal info → **User IDs** | Yes | No | App functionality, Account management | Optional | `User.id` на профила — само при регистрация; гост поръчва без него |
| Financial info → **Purchase history** | Yes | No | App functionality | Required | Историята на поръчките (номер, дата, артикули, суми) |
| App activity → **Other user-generated content** | Yes | No | App functionality | Optional | Бележката към поръчката и бележките по артикул |
| Device or other IDs | No | No | — | — | Няма Advertising ID, няма device fingerprint |
| Location | No | No | — | — | Адресът се въвежда на ръка; GPS не се пипа |
| Financial info → User payment info | No | No | — | — | Плаща се в брой на вратата; няма карти |
| App info and performance (Crash logs, Diagnostics) | No | No | — | — | Няма crash reporter, няма аналитика |
| Messages, Photos, Contacts, Calendar, Files | No | No | — | — | Приложението не ги пипа |

⚠️ Две неща, в които е лесно да се сбърка:

- **Purchase history е под „Financial info“, не под „App activity“.** Google я
  държи там, макар че нищо не се плаща онлайн.
- **Бележката към поръчката е „Other user-generated content“.** Текст, който
  потребителят е написал, е данна. Пропускането ѝ е най-често срещаният
  пропуск в подобни листинги.

**„Shared“ е No навсякъде.** Google смята за „sharing“ предаването на трето
лице, което ползва данните за свои цели, и изрично изключва обработващия по
нареждане („service provider“). Нашите са точно такива:

| Получател | Какво вижда | Защо не е „sharing“ |
|---|---|---|
| **Render** (хостинг) | Всичко — базата данни и сървърните логове (IP, час на заявката) са на негова инфраструктура | Обработващ по договор; не ползва данните за свои цели |
| **Resend** (имейли) | Име, имейл и съдържанието на съответния имейл | Същото — само доставя съобщението |
| **Google Карти** | IP адреса на устройството, **само** при отваряне на „Контакти“ | Вградена карта, не наш трансфер на потребителски данни. Ако рецензент попита: това е `<iframe>` към `google.com/maps?...&output=embed`, без API ключ, без SDK и без данни на клиента в заявката |

Сървърните логове (IP + час) **не се декларират** като събирана данна: Google
пита за данни, събирани от приложението, а не за неизбежните HTTP логове на
хостинга. Оповестени са в политиката за поверителност, където им е мястото.

Останалите въпроси:

- „Is all of the user data collected by your app encrypted in transit?“ → **Yes**
- „Do you provide a way for users to request that their data is deleted?“ → **Yes**
- **Data deletion URL:** `https://pizza-pazzo.onrender.com/account-deletion`
- „Data deletion“ за всеки отметнат ред → **Yes** (виж по-долу — вече е вярно)

### Изтриване на профил

Google изисква **два** пътя. И двата съществуват:

1. **В приложението:** Профил → „Изтриване на профила“ → потвърждение с парола
2. **Публична страница:** `/account-deletion` — работи и за деинсталирал
   приложението; линкната е във футъра

Какво точно се случва (код: `lib/privacy.ts`, тест: `npm run smoke:deletion`):

- изтриват се профилът, паролата и запазените адреси;
- от старите поръчки се **заличават** името, имейлът, телефонът, адресът и
  бележките — не просто се откачат от профила;
- остава счетоводната част: номер, дата, артикули, суми. Това е задържане по
  законово задължение (чл. 17, § 3, б. „б“ ОРЗД) и Google изисква да е изрично
  оповестено — оповестено е в политиката, на `/account-deletion` и в самия екран
  за изтриване;
- поръчка, която в момента се приготвя или пътува, запазва адреса си, докато
  бъде доставена или отказана, и се заличава автоматично в този момент.

Това е промяна от 25.09.2026. Дотогава поръчките пазеха името, телефона, имейла
и адреса завинаги, докато политиката твърдеше обратното — точно разминаването,
което рецензент проверява пръв.

### Bluetooth и Data safety

Bluetooth разрешението **не** е данна и не се декларира в Data safety. Ако
рецензент попита: то се използва само за връзка с вече сдвоен термален принтер,
не се сканира за устройства, не се извлича местоположение (декларирано с
`neverForLocation`), и клиентът никога не бива питан за него — диалогът се
появява само на служебния екран за настройки на принтера.

## 8. Store listing — готови текстове

**App name** (11/30):

```
Pizza Pazzo
```

**Short description BG** (72/80):

```
Разгледай менюто и поръчай любимата си пица от Pizza Pazzo, Плевен.
```

**Short description EN** (71/80):

```
Browse the menu and order your favourite pizza from Pizza Pazzo, Pleven.
```

**Full description BG:**

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
• Доставка до адрес, с плащане в брой при получаване.
• Виждате сумата преди да потвърдите — без изненади накрая.

ПРОФИЛ
• С профил името, телефонът и имейлът ви се попълват автоматично при поръчка.
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

**Full description EN:**

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
• Delivery to your address, paid in cash on arrival.
• You see the total before you confirm — no surprises at the end.

YOUR ACCOUNT
• With an account your name, phone and email fill themselves in at checkout.
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

**Други полета:**

| Поле | Стойност |
|---|---|
| App or game | App |
| Free or paid | Free |
| **Category** | **Food & Drink** |
| Tags | Food delivery, Restaurants |
| Contact email | orderspp@gmail.com |
| Contact phone | +359 88 248 4777 |
| Website | https://pizza-pazzo.onrender.com (**не** pizzapazzo.bg) |
| Държави | България |
| Default language | Български (bg-BG) |

## 9. App access — текст за рецензента

Полето се чете от рецензент в Google, не от клиента, затова текстът е **на
английски**. Паролите се вадят от `npm run accounts:review` (виж по-долу) —
попълни ги, преди да подадеш.

```
Pizza Pazzo is a food-ordering app for a pizzeria in Pleven, Bulgaria.

NO SIGN-IN NEEDED (most of the app):
The menu, categories, products, the cart and placing a delivery order all work
without any account. You can test the whole ordering flow straight after
opening the app. Payment is cash on delivery — no card, no in-app purchase.

WITH A CUSTOMER ACCOUNT:
Registration is free and takes seconds. An account pre-fills your name, phone
and email at checkout, keeps your order history, and can be deleted from inside
the app (Profile -> Delete account).

Demo customer account:
  email: review.customer@pizzapazzo.review
  password: <paste from `npm run accounts:review`>

STAFF AREA (restricted):
The live orders board, accepting/rejecting orders and receipt printing are for
restaurant staff only. This is a demo staff account. It can watch the board,
accept, reject and print orders, and mark a product as sold out — nothing
else. It cannot manage users, change roles, edit the menu or prices, or change
the restaurant's settings:

  email: review.staff@pizzapazzo.review
  password: <paste from `npm run accounts:review`>

After signing in, open "Админ" (Admin) -> "Поръчки" (Orders) -> "На живо"
(Live). The admin panel is in Bulgarian only, as it is used by the restaurant's
own staff.

HOW TO SEE A FULL ORDER GO THROUGH:
1. Place an order as a guest or as the demo customer.
2. Sign in as the demo staff account and open the live orders board.
3. The new order appears there within a few seconds, with an alarm sound.
4. Accept it (an estimated time is required) or reject it.

PRINTING:
Receipt printing needs a paired Bluetooth thermal printer, which a test device
will not have — the button will say no printer is selected. That is the
expected behaviour without the hardware. The Bluetooth permission is requested
only inside the staff printer-settings screen, never at startup, and never for
a customer.

NOTE ON OPENING HOURS:
If the restaurant is closed at the moment you test, the app says when it opens
again instead of accepting an order. Staff can open it manually. If this blocks
your review, please contact us and we will open it for the duration.
```

⚠️ **Направи демо акаунтите преди подаването:**

```bash
npm run accounts:review      # локално
# или в Render Shell:  node scripts/create-review-accounts.mjs
```

Скриптът създава `review.customer@…` (CUSTOMER) и `review.staff@…` (**STAFF**,
никога ADMIN) с измислени данни на домейн `pizzapazzo.review`, който не
съществува — имейл до тях не стига до никого. Паролите се печатат веднъж;
повторно пускане ги сменя, което е и начинът да ги ротираш след прегледа.

**Не давай реалния акаунт на собственика.** STAFF вижда таблото, приема/отказва,
печата и може да маркира продукт като изчерпан — точно колкото е нужно. Не може
да отваря `/admin/users`, да сменя роли, да редактира менюто и цените, да гледа
отчетите или да пипа настройките на заведението (проверено: `requireRole` в
`app/[locale]/admin/{users,categories,reports}/page.tsx` и в `app/actions/admin-*.ts`).

## 10. Content rating (IARC)

На всичко „Не“:

```
Насилие                                   НЕ
Сексуално съдържание                      НЕ
Ругатни                                   НЕ
Наркотици                                 НЕ
Хазарт                                    НЕ
Съдържание от потребители                 НЕ (бележките към поръчката се виждат
                                          само от персонала)
Споделяне на местоположение               НЕ
Споделяне на лични данни с трети страни   НЕ
Нерестриктиран достъп до интернет         НЕ (WebView е заключен към allowlist)
Покупки в приложението                    НЕ (плаща се при доставка)

Алкохол                                   ДА  ← виж по-долу
```

```
🍺 АЛКОХОЛ — ПРОВЕРЕНО, ОТГОВОРЪТ Е „ДА“
Проверено в базата на 25.09.2026: категория „Безалкохолни напитки и бира“
(cat_drinks) съдържа Стела Артоа и Хайнекен, и двете налични за поръчка.
Заглавието на категорията казва „безалкохолни“, но съдържанието е друго.

Значи:
  • В IARC въпросника „Препраща ли приложението към алкохол / дава ли
    възможност за закупуване“ → ДА.
  • Възрастовата група се вдига (т. 11).
  • Невярно попълнен въпросник е основание за сваляне на приложението —
    това е един от малкото начини да загубиш листинга наведнъж.
```

⚠️ **Решение, което трябва да вземе клиентът, преди подаването:**

| Вариант | Какво значи |
|---|---|
| **А. Оставяме бирата** | Рейтингът е 18+, приложението не се показва на непълнолетни, и при поръчка с бира трябва да има потвърждение за възраст (в България продажбата на алкохол на лица под 18 г. е забранена — важи и за доставка). Такова потвърждение в момента **няма** в чекаута. |
| **Б. Махаме бирата от приложението** | Двата продукта се маркират като неналични или се скриват; рейтингът пада до 13+, нищо друго не се променя. Бира пак може да се поръча по телефона. |

Каквото и да се избере, **категорията трябва да се преименува** — „Безалкохолни
напитки и бира“ е вътрешно противоречиво и ще бъде забелязано.

Категория във въпросника: **Reference, News, or Educational** → не; изберѝ
**Utility, Productivity, Communication or Other** ако няма по-точна за поръчка
на храна.

## 11. Target audience

```
Възрастови групи:  18+   ← защото менюто съдържа бира (т. 10)
Насочено към деца: НЕ
Families policy:   НЕ СЕ ПРИЛАГА
```

Приложение за поръчка на храна не е „designed for children“. Ако бирата бъде
махната от менюто (вариант Б в т. 10), тогава и само тогава групата се връща на
**13+**.

## 12. Коя писта и правилото за 12 тестера

| Вариант | Кога |
|---|---|
| **Internal testing** | Пусни веднага. До 100 тестера, без публичен листинг, за часове |
| **Closed testing** | Задължителна стъпка за нови лични акаунти |
| **Production** | Публично |

⚠️ **Нови ЛИЧНИ акаунти**, създадени след 13.11.2023, трябва да минат closed
test с **минимум 12 тестера, активни 14 поредни дни**, преди Play да отвори
Production. Акаунт от тип **организация** няма това изискване в документацията на
Google. Ако клиентът има фирма, **регистрирай акаунта като организация**.

Сега, когато приложението е клиентско, Production вече е разумна цел — рискът по
„Minimum Functionality“, който тежеше на кухненския инструмент, отпада: това е
пълноценно приложение за поръчка на храна с нативен принтерен стек отгоре.

## 13. Графики и екранни снимки

Готови в `play-assets/`:

| Файл | Размер | Къде |
|---|---|---|
| `play-icon-512.png` | 512×512 PNG, **32-bit с alpha** (Play отказва 24-bit) | App icon |
| `play-feature-graphic-1024x500.png` | 1024×500 PNG, без alpha | Feature graphic |

Регенерират се с `npm run icons:play`.

⚠️ **Снимките на продуктите са placeholder-и.** Проверено в базата на
25.09.2026: от 98 продукта **97 показват SVG placeholder**, а „Маргарита“ няма
снимка изобщо. Екранни снимки на меню от еднакви сиви картинки не изглеждат
като работещо приложение, а описанието в Play обещава „меню със снимки“. Или
клиентът дава истински снимки, или обещанието се маха от описанието — виж
`docs/client-assets-needed.md`.

**Екранните снимки липсват и трябва да се направят на ръка** — Play изисква
реални екрани; нарисувани са нарушение. Планът и изискванията са в
[play-assets/README.md](play-assets/README.md). Клиентските екрани са
приоритетни.

## 14. Ред на действията

1. Регистрирай developer акаунт и пусни проверката на самоличността
2. Архивирай keystore-а на две места ← **не пропускай**
3. Направи демо STAFF акаунт
4. Провери, че `/app-privacy` и `/account-deletion` се отварят в инкогнито
5. Направи екранните снимки на телефон и таблет
6. `gradlew.bat bundleRelease`
7. Play Console: **Create app** → декларациите
8. **App content** целия (т. 6, 7)
9. **Store listing** (т. 8) + графиките (т. 13)
10. **Testing → Internal testing** → качи `.aab` → тестери → Roll out
11. Инсталирай, тествай клиентския поток и служебния печат
12. Production

## 15. Какво ще счупи прегледа

- Липсващи демо данни в „App access“
- Политика за поверителност, която не се отваря или сочи стария домейн
- Data safety с отговор „No data collected“
- `/account-deletion`, което връща 404
- Качен APK вместо AAB
- Повтарящ се `versionCode`
- Екранни снимки, които не са от приложението
- Невярно попълнен въпрос за алкохол
