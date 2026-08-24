# Pizza Pazzo — build и release за Google Play

Техническият наръчник: как се build-ва, подписва и качва Android приложението.
Стъпките в самата Play Console (акаунт, декларации, листинг, тестови писти) са
в **[../android-app/PLAY_STORE.md](../android-app/PLAY_STORE.md)**.

## 0. Какво е приложението

```
ЕДНО ПРИЛОЖЕНИЕ — bg.pizzapazzo.app, "Pizza Pazzo"
├── Клиентска част
│   меню · продукти · количка · доставка/вземане · поръчка · профил · история
│   Държи се като нормално Android приложение: системни ленти на място,
│   екранът заспива, back излиза.
│
└── Служебна част (страниците /admin)
    живо табло · приемане/отказ · настройки на принтера · печат на бележки
    + нативен ESC/POS Bluetooth стек (58/80 mm, кирилица, auto-reconnect)
    Само тук екранът се държи буден и лентите се скриват.
```

**Модел на сигурността.** Кой какво може да види решава **уеб автентикацията на
сървъра**, от сесийната бисквитка. Приложението не раздава права и не може да
заобиколи backend-а. Проверката по URL (`StaffRoutes`) решава само две неща —
дали екранът да остане буден и дали принтерният bridge да отговаря — и е
допълнителен слой, не самата авторизация.

**Bluetooth разрешението не се иска при стартиране.** Появява се единствено
когато някой отвори служебните настройки на принтера и натисне „Избери сдвоен
принтер“. Клиент, който поръчва пица, никога не го вижда.

---

## 1. Какво трябва да има на машината

| Изисква се | Версия | Къде |
|---|---|---|
| Android Studio | Otter (2026.1) или по-нов | инсталиран |
| JDK | 21 | идва със Studio: `C:\Program Files\Android\Android Studio\jbr` |
| Android SDK | Platform 36 + Build-Tools 36 | `%LOCALAPPDATA%\Android\Sdk` |
| Gradle | 8.14.5 | тегли се сам от wrapper-а |

⚠️ Системният `java` на тази машина е **JDK 8** и Gradle няма да тръгне с него.
От Android Studio това няма значение (Studio си ползва своя JDK). От терминал
задайте `JAVA_HOME` първо:

```bash
# Git Bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

```powershell
# PowerShell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

## 2. Подписване

Release ключът се чете автоматично от `android-app/keystore.properties`:

```properties
storeFile=keystore/pizzapazzo-kitchen.jks
storePassword=…
keyAlias=kitchen
keyPassword=…
```

Името на файла и `CN=Pizza Pazzo Kitchen` в сертификата са от времето, когато
приложението беше само за кухнята. Не са преименувани нарочно: това е
най-незаменимият файл в проекта, ако вече е архивиран под това име, две имена за
един ключ са покана за грешка при възстановяване — а сертификатът не се вижда
никъде (Play показва името на разработчика от акаунта). Смяната би означавала
нов ключ, тоест ново приложение.

Файлът и папката `keystore/` са в `.gitignore` и **не влизат в репото**. Ако
`keystore.properties` липсва, release build-ът пак минава — но излиза
**неподписан** и Play го отказва. Това е нарочно: липсващ ключ трябва да се
забелязва веднага, а не да се пробутва с debug подпис.

### Правило номер едно

> Ключът и паролата се пазят на поне две места извън този компютър.
> Без тях приложението не може да бъде обновявано в Play **никога повече** —
> единственият изход е ново приложение с нов package name и преинсталиране на
> всички устройства.

Проверка на сертификата (не показва пароли — ще ги поиска интерактивно):

```bash
keytool -list -v -keystore android-app/keystore/pizzapazzo-kitchen.jks
```

### Play App Signing

При създаването на приложението Play предлага **Play App Signing** — приемете.
След това:

- Google държи ключа, с който приложението реално се подписва за устройствата;
- нашият ключ става само **upload key**;
- ако upload ключът се загуби, Google може да го подмени. Това е единствената
  предпазна мрежа, която съществува — без нея загубен ключ е окончателен.

## 3. Версии

И двете са в `android-app/app/build.gradle.kts`:

```kotlin
versionCode = 1        // цяло число, Play отказва повтарящо се
versionName = "1.0.0"  // това вижда потребителят
```

Правилото при всяко качване:

| Промяна | versionCode | versionName |
|---|---|---|
| поправка на бъг | +1 | 1.0.1 |
| нова функционалност | +1 | 1.1.0 |
| голяма преработка | +1 | 2.0.0 |

`versionCode` **само расте** и никога не се връща назад — дори за качване в
Internal testing.

## 4. Build

```bash
cd android-app

# За Google Play (единственият приеман формат)
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab

# За директна инсталация на таблета, без Play
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

На Windows CMD/PowerShell: `gradlew.bat` вместо `./gradlew`.

Копие с говорещо име се слага и в `android-app/dist/` (папката е извън
git) — така не се обърква коя версия е качена.

Проверка, че наистина е подписан:

```bash
"$ANDROID_SDK/build-tools/36.0.0/apksigner.bat" verify --print-certs \
  android-app/app/build/outputs/apk/release/app-release.apk
```

## 5. Тестове и проверки преди качване

```bash
cd android-app
./gradlew testReleaseUnitTest   # unit тестове (принтер логика, без хардуер)
./gradlew lintRelease           # Android lint; спира при грешка
```

За сайта, от корена на проекта:

```bash
npm run type-check
npm run check:i18n
npm run lint
npm run build
```

## 6. Инсталиране на таблета за тест

1. Копирайте `app-release.apk` на таблета (USB, Google Drive или `adb install`).
2. Отворете файла → Android ще поиска „Инсталиране от неизвестни източници“ →
   разрешете за файловия мениджър.
3. Ако вече има инсталирано debug копие, деинсталирайте го първо — debug и
   release са подписани с различни ключове и Android отказва да ги смени един
   с друг.
4. ⚠️ Ако на устройството стои стара версия с пакет `pizzapazzo.kitchen`, тя е
   **друго приложение** за Android и няма да бъде заменена. Деинсталирайте я
   ръчно, иначе двете ще стоят една до друга.

## 7. Качване в Play

Пълната процедура е в [PLAY_STORE.md](../android-app/PLAY_STORE.md).
Накратко:

1. Play Console → приложението → **Testing → Internal testing**
2. **Create new release**
3. Качете `.aab`
4. Release notes (готови текстове в PLAY_STORE.md)
5. **Next → Save → Review release → Start rollout**

## 8. Обновяване на вече публикувано приложение

1. Промените в кода.
2. `versionCode` +1, `versionName` нов.
3. `./gradlew bundleRelease`
4. Ново release в същата писта → качване → rollout.

Ползвателите получават обновяването автоматично. Ако устройството е кухненският
таблет, изчакайте края на смяната — обновяването рестартира приложението.

⚠️ **`applicationId` не се сменя повече.** След първото публикуване той е
идентичността на приложението в Play; смяната му означава ново приложение с
нулева история и ръчно преинсталиране навсякъде.

## 9. Rollback

Play няма бутон „върни предишната версия“. Ако едно качване е счупено:

1. **Halt rollout** в Play Console (спира разпространението към нови устройства).
2. Поправете кода.
3. Качете **нов** build с **по-висок** versionCode (напр. 1.0.2 след счупената
   1.0.1) — това е единственият начин да върнете старото поведение.

Затова: пускайте първо в Internal testing и инсталирайте на таблета, преди
Production.

## 10. Какво НЕ влиза в git

`android-app/.gitignore` покрива:

```
keystore.properties
keystore/
*.jks  *.keystore
*.apk  *.aab
local.properties
build/  .gradle/  .idea/
```

Преди commit винаги: `git status` — ако там се появи нещо от списъка, спрете и
проверете `.gitignore`, вместо да го commit-вате.
