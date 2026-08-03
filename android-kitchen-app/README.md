# Pizza Pazzo Kitchen — Android приложение за кухненския таблет

Android WebView обвивка около живото табло за поръчки на Pizza Pazzo
(`/admin/orders/live`) + Bluetooth ESC/POS печат на кухненски бележки.

- **Package:** `pizzapazzo.kitchen`
- **Минимална версия:** Android 8.0 (API 26) · **target/compile:** API 35
- **Стек:** Kotlin · Gradle Kotlin DSL · Material 3 · WebView · Bluetooth Classic (SPP/RFCOMM) · Coroutines

## Какво прави

1. Отваря на цял екран (без адресна лента) живото табло за поръчки — там си
   остават алармата, приемането и отказването на поръчки (те са логика на сайта).
2. Инжектира `window.AndroidPrinter` bridge, чрез който страницата печата
   бележки на Bluetooth термален принтер.
3. Държи екрана буден, пази login сесията (cookie), възстановява се при
   загуба на интернет, блокира навигация към чужди сайтове.

## Отваряне в Android Studio

1. Инсталирайте [Android Studio](https://developer.android.com/studio) (Ladybug
   или по-нов; включва нужния JDK 17).
2. **File → Open** → изберете папката `android-kitchen-app` (НЕ корена на репото).
3. Изчакайте Gradle sync (първия път тегли Gradle 8.10.2 + зависимости).
4. Ако Studio поиска Android SDK Platform 35 / Build-Tools — приемете
   предложената инсталация.

## Build на debug APK

От Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

Или от терминал в `android-kitchen-app/`:

```
# Windows
gradlew.bat assembleDebug
# macOS/Linux
./gradlew assembleDebug
```

Готовият APK е в: `app/build/outputs/apk/debug/app-debug.apk`

Тестовете: `gradlew.bat testDebugUnitTest` (работят без принтер — mock transport).

## Инсталиране на таблета

1. Копирайте `app-debug.apk` на таблета (USB, Google Drive, или `adb install`).
2. Отворете файла. Android ще поиска разрешение „Инсталиране от неизвестни
   източници“ → **Настройки → Приложения → Специален достъп → Инсталиране на
   непознати приложения** → разрешете за файловия мениджър/браузъра.
3. Инсталирайте. Иконата е „Pizza Pazzo Kitchen“.
4. При първо стартиране се отваря kitchen страницата — влезте с STAFF/ADMIN
   акаунт. Сесията се пази (httpOnly cookie, 30 дни).

## Сдвояване на Bluetooth принтера

Приложението **не сканира** за устройства — използва вече сдвоен принтер:

1. Включете принтера.
2. На таблета: **Настройки → Bluetooth → Сдвояване на ново устройство** →
   изберете принтера (PIN обикновено `0000` или `1234`).
3. В приложението: докоснете полупрозрачното зъбно колело долу вдясно →
   **Избери сдвоен принтер** → изберете принтера от списъка.
   (На Android 12+ приложението ще поиска разрешение „Устройства наблизо“ /
   Bluetooth — разрешете го.)
4. **Тест на връзката**, после **Тестов печат**.

## Тестов печат

Настройки → **Тестов печат**. Печата български букви (главни/малки), цифри,
символи, „25.50 EUR“ и примерна поръчка. Тестът е успешен, ако
кирилицата се чете. Ако не се чете — сменете кодирането (виж по-долу) и
повторете.

## Настройки 58/80 mm и кодиране

- **Ширина на хартията:** 58 mm (32 символа/ред) или 80 mm (48 символа/ред).
  „Символи на ред“ се попълва автоматично, но може да се коригира ръчно —
  някои принтери имат различен шрифт (напр. 42 на 80 mm).
- **Кодиране (кирилица):** три режима:
  - **CP866 (DOS Cyrillic)** — по подразбиране, най-широко поддържан (`ESC t 17`);
  - **CP1251 (Windows Cyrillic)** — често на нови китайски принтери (`ESC t 73`);
  - **UTF-8** — само за принтери с истинска UTF-8 поддръжка.

  Стойността на `ESC t` варира между производители — тя е конфигурируема в
  кода (`PrinterPreferences.codePageOverride`); ако никой текстов режим не
  работи, архитектурата има документиран изход: **bitmap/raster fallback**
  (рендиране на всеки ред като картинка, `GS v 0`) — виж коментара в
  `printer/PrinterSettings.kt`; реализира се като нов рендерер в
  `EscPosPrinterService`, без промени по formatter-а.

## Как работи JavaScript bridge-ът

Приложението инжектира `window.AndroidPrinter` само в собственото си WebView.
Всеки чувствителен метод проверява текущия origin срещу allowlist
(`webview/AllowedOrigins.kt`): `pizza-pazzo.onrender.com`, `pizzapazzo.bg`,
`www.pizzapazzo.bg`; в debug build — и localhost/LAN dev сървър.

```js
AndroidPrinter.isAvailable()          // true само в приложението, на разрешен origin
AndroidPrinter.getPrinterStatus()     // JSON: { state, printerName, hasPrinter, lastError }
AndroidPrinter.openPrinterSettings()  // отваря нативния екран с настройки
AndroidPrinter.printOrder(orderJson)  // асинхронен печат; резултат чрез event
AndroidPrinter.printTestPage()
AndroidPrinter.disconnectPrinter()
```

Резултатът се връща като CustomEvent:

```js
window.addEventListener("pizza-pazzo-print-result", (e) => {
  // e.detail = { orderId, success, message, reason }
});
```

Уеб-страницата (Next.js проектът) има готов helper: `lib/android-printer.ts` +
компонент `components/admin/PrintOrderButton.tsx`. Бутонът „ПРИНТИРАЙ
ПОРЪЧКАТА“ се появява само след приемане на поръчката; печатът никога не е
автоматичен; повторният печат е отделно действие и се отбелязва
„*** ПОВТОРЕН ПЕЧАТ ***“ на бележката. JSON-ът е ограничен до 100 KB и се
валидира изцяло в `models/PrintableOrder.kt`.

## Release APK

1. Генерирайте keystore (еднократно, пазете го!):
   ```
   keytool -genkey -v -keystore pizzapazzo-kitchen.jks -keyalg RSA -keysize 2048 -validity 10000 -alias kitchen
   ```
2. В Android Studio: **Build → Generate Signed App Bundle / APK → APK** →
   изберете keystore-а → build variant **release**.
3. APK: `app/build/outputs/apk/release/app-release.apk`.

Забележки: release build-ът НЕ позволява http/localhost origins; minification
е изключен нарочно (R8 може да счупи bridge-а; keep-правилата са готови в
`proguard-rules.pro`, ако някога се включи).

## Структура на кода

```
app/src/main/java/pizzapazzo/kitchen/
├── MainActivity.kt              # fullscreen WebView, splash, offline екран, back
├── KitchenApplication.kt        # споделено wiring (prefs, manager, print service)
├── webview/
│   ├── AllowedOrigins.kt        # allowlist за навигация + bridge
│   ├── KitchenWebViewClient.kt  # навигационна политика, грешки, committed URL
│   └── JavascriptBridge.kt      # window.AndroidPrinter (+ origin re-check)
├── bluetooth/
│   ├── BluetoothDeviceRepository.kt  # само сдвоени устройства, permissions
│   ├── BluetoothSocketTransport.kt   # RFCOMM/SPP transport (IO dispatcher, timeout)
│   ├── BluetoothPrinterManager.kt    # transport фабрика + ясни причини за отказ
│   └── PrinterConnectionState.kt     # DISCONNECTED/CONNECTING/CONNECTED/PRINTING/ERROR
├── printer/
│   ├── PrinterTransport.kt      # интерфейс + MockPrinterTransport
│   ├── EscPos.kt                # ESC/POS байтове (init, bold, double, cut, code page)
│   ├── PrinterSettings.kt       # 58/80mm, кодиране, code page, cut, feed
│   ├── ReceiptFormatter.kt      # чист Kotlin: PrintableOrder → редове (тестван)
│   ├── EscPosPrinterService.kt  # parse → format → encode → send; mutex; reconnect
│   └── PrintResult.kt
├── settings/
│   ├── SettingsActivity.kt      # избор на принтер, тестове, диагностика
│   └── PrinterPreferences.kt    # SharedPreferences (без чувствителни данни)
└── models/
    └── PrintableOrder.kt        # защитен JSON parser + валидация + 100KB лимит
```

## Известни ограничения (v1)

- **Локалният build не е изпълняван** — на машината, на която е генериран
  проектът, няма Android SDK/JDK 17. Отворете в Android Studio и build-нете.
- Bitmap/raster fallback за кирилица е проектиран, но не е имплементиран.
- Няма продуктови изображения/лога на бележката — само текст.
- Авто-reconnect е „един опит при печат“, не фонов keep-alive.
- Печатът на живото табло изисква поръчката да е приета в текущата сесия
  (секция „Приети наскоро“); стари поръчки се препечатват от
  Админ → Поръчки → детайли.
- `192.168.68.129` (dev LAN IP) е в debug allowlist — сменете го, ако dev
  машината има друг адрес.

## Каква информация е нужна за реалния принтер

Когато принтерът бъде купен/определен, изпратете:

1. **Марка и модел** (напр. Xprinter XP-58IIH, Goojprt PT-210…);
2. ширина на хартията (58 или 80 mm);
3. поддържа ли ESC/POS (пише го в спецификацията) и има ли auto-cutter;
4. кои code pages поддържа за кирилица (CP866? CP1251? UTF-8?) — от
   ръководството или от self-test разпечатката (задръжте feed бутона при
   включване — принтерът сам печата списъка);
5. Bluetooth име и PIN;
6. ако не е стандартен ESC/POS — има ли vendor SDK (тогава се добавя нов
   `PrinterTransport`, останалото не се пипа).

## Troubleshooting

| Проблем | Решение |
|---|---|
| Празен екран при старт | Няма интернет → екранът „Опитай отново“; проверете Wi-Fi. |
| Иска login всеки път | Не излизайте от профила; cookie-то се пази 30 дни. Изтриването на кеша НЕ трие сесията. |
| Принтерът не е в списъка | Първо го сдвоете в Android Bluetooth настройките; после разрешете „Устройства наблизо“. |
| „Неуспешно свързване“ | Принтерът е изключен/заспал, или друго устройство държи връзката (изключете стария телефон/таблет). |
| Кирилицата е йероглифи | Сменете кодирането (CP866 ↔ CP1251) и направете тестов печат. |
| Реже по средата на бележката | Увеличете „Празни редове след бележката“. |
| Текстът е по-широк от хартията | Намалете „Символи на ред“ (някои 58mm принтери са 30, не 32). |
| Бутонът за печат липсва на таблото | Страницата е отворена в обикновен браузър — бутонът работи само в приложението. |
| Двойни бележки | Не може от двойно натискане (има защита) — проверете дали не печатат две устройства едновременно. |
