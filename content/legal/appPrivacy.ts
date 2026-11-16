import type { LegalDoc } from "./types";

/**
 * Политика за поверителност на Android приложението „Pizza Pazzo“
 * (пакет `bg.pizzapazzo.app`).
 *
 * Google Play изисква публичен URL с политика за поверителност за всяко
 * приложение. Документът е отделен от `privacy.ts`, защото Play проверява
 * страница, която описва ПРИЛОЖЕНИЕТО: неговите разрешения, това, което пази на
 * устройството, и пътя за изтриване на профил. `privacy.ts` описва сайта.
 *
 * Едно приложение, двама потребители: клиент, който поръчва, и служител, който
 * приема поръчки и печата бележки. Текстът трябва да описва и двете, без да
 * плаши клиента с Bluetooth, който никога няма да види.
 *
 * Съдържанието трябва да съответства едно към едно на попълнения в Play
 * Console формуляр „Data safety“ — виж android-app/PLAY_STORE.md. Ако
 * приложението някога започне да събира нещо ново, ПЪРВО се обновява този
 * текст, после формулярът.
 */
export const appPrivacyDoc: LegalDoc = {
  slug: "app-privacy",
  version: "2026-10-14",
  updated: "14.10.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази политика се отнася за Android приложението „Pizza Pazzo“ (пакет bg.pizzapazzo.app). Приложението показва системата на заведението: с него разглеждате менюто, съставяте поръчка и следите профила си. Същото приложение се използва и от персонала на Pizza Pazzo за приемане на поръчки и печат на кухненски бележки — разликата е само какво ви показва системата след като влезете.",
        en: "This policy covers the “Pizza Pazzo” Android app (package bg.pizzapazzo.app). The app presents the restaurant's own system: you browse the menu with it, put an order together and follow your account. The same app is also used by Pizza Pazzo staff to accept orders and print kitchen tickets — the only difference is what the system shows you once you sign in.",
      },
    },
    {
      p: {
        bg: "Администратор на личните данни е „ПИЦА ПАЦО“ ЕООД, ЕИК 203300275 (данните за контакт са по-долу). Данните, обработвани през сайта, са описани и в общата Политика за поверителност.",
        en: "The data controller is PIZZA PAZZO LTD, UIC 203300275 (contact details below). Data processed through the website is also described in our general Privacy Policy.",
      },
    },
  ],
  sections: [
    {
      heading: {
        bg: "1. Какви данни се обработват през приложението",
        en: "1. What data the app processes",
      },
      blocks: [
        {
          p: {
            bg: "Приложението не създава собствен, отделен профил. То показва сайта на Pizza Pazzo по HTTPS — точно както би направил браузър. В него няма реклами и рекламно проследяване. Единственото SDK на трета страна е Google Analytics за Firebase (от версия 1.2.0), което работи само ако го разрешите — виж раздел 2.",
            en: "The app creates no separate account of its own. It shows the Pizza Pazzo website over HTTPS — exactly as a browser would. It contains no ads and no advertising tracking. The only third-party SDK is Google Analytics for Firebase (from version 1.2.0), which runs only if you allow it — see section 2.",
          },
        },
        {
          p: {
            bg: "Това обаче не значи, че през приложението не минават лични данни. Когато поръчвате или се регистрирате в него, въведеното се обработва от „ПИЦА ПАЦО“ ЕООД по същия начин, както ако бяхте отворили сайта в браузър. Затова изброяваме и него — приложението е каналът, през който минава:",
            en: "That does not mean no personal data passes through the app, though. When you order or register in it, what you enter is processed by PIZZA PAZZO LTD exactly as if you had opened the site in a browser. So it is listed here too — the app is the channel it travels through:",
          },
        },
        {
          list: [
            {
              bg: "При поръчка: име, телефон, имейл, адрес за доставка, съдържание на поръчката и бележки към нея.",
              en: "When ordering: name, phone, email, delivery address, the contents of the order and any notes.",
            },
            {
              bg: "При регистрация: име, имейл, телефон, парола (пази се само като необратим хеш) и запазените от вас адреси.",
              en: "When registering: name, email, phone, password (stored only as an irreversible hash) and your saved addresses.",
            },
            {
              bg: "История на поръчките ви, докато профилът съществува.",
              en: "Your order history, for as long as the account exists.",
            },
            {
              bg: "Технически данни на сървъра: кратки логове (IP адрес, час на заявката) за сигурност и отстраняване на проблеми.",
              en: "Technical data on the server: short-lived logs (IP address, request time) for security and troubleshooting.",
            },
          ],
        },
        {
          p: {
            bg: "Данните минават през трима доставчика, всеки от които обработва само по наше нареждане и за посочената цел:",
            en: "The data passes through three providers, each processing it only on our instructions and only for the stated purpose:",
          },
        },
        {
          list: [
            {
              bg: "Render (хостинг) — сайтът и базата данни работят на негова инфраструктура; там се пазят профилите и поръчките, както и кратките сървърни логове.",
              en: "Render (hosting) — the site and the database run on its infrastructure; the accounts, the orders and the short-lived server logs live there.",
            },
            {
              bg: "Resend (имейли) — през него минават имейлът за потвърждение на поръчка и известието до заведението. Вижда името, имейла и съдържанието на съответното съобщение.",
              en: "Resend (email) — the order confirmation to you and the notification to the restaurant are sent through it. It sees the name, the email address and the contents of that message.",
            },
            {
              bg: "Google Карти — на страница „Контакти“ е вградена карта на адреса на заведението. Тя се зарежда от сървър на Google, който при това вижда IP адреса на устройството ви, както при всяка вградена карта в интернет. Ако не отворите тази страница, карта не се зарежда.",
              en: "Google Maps — the “Contacts” page embeds a map of the restaurant's address. It loads from a Google server, which in doing so sees your device's IP address, as with any embedded map on the web. If you do not open that page, no map is loaded.",
            },
          ],
        },
        {
          p: {
            bg: "Данните не се продават, не се предоставят за чужди рекламни цели и не се използват за автоматизирано профилиране. Целите, основанията и сроковете са описани изцяло в Политиката за поверителност на сайта.",
            en: "The data is not sold, is not handed to anyone for their own advertising, and is not used for automated profiling. The purposes, legal bases and retention periods are set out in full in the website's Privacy Policy.",
          },
        },
      ],
    },
    {
      id: "analytics",
      heading: {
        bg: "2. Статистика за употреба (Google Analytics за Firebase)",
        en: "2. Usage statistics (Google Analytics for Firebase)",
      },
      blocks: [
        {
          p: {
            bg: "При първото стартиране приложението ви пита дали разрешавате статистика за употреба. Докато не отговорите, и ако откажете, към Google не се изпраща нищо — събирането е изключено по подразбиране. Изборът не влияе на поръчването.",
            en: "On first start the app asks whether you allow usage statistics. Until you answer, and if you decline, nothing is sent to Google — collection is switched off by default. Your choice does not affect ordering.",
          },
        },
        {
          p: {
            bg: "Ако разрешите, приложението изпраща към Google Analytics за Firebase (Google Ireland Ltd / Google LLC, като обработващ):",
            en: "If you allow it, the app sends the following to Google Analytics for Firebase (Google Ireland Ltd / Google LLC, as processor):",
          },
        },
        {
          list: [
            {
              bg: "кои страници от приложението отваряте — само вида на страницата („меню“, „продукт“, „количка“), без адреса и параметрите ѝ;",
              en: "which pages of the app you open — only the kind of page (“menu”, “product”, “basket”), never its address or parameters;",
            },
            {
              bg: "разглеждане на продукт, добавяне в количката, започване на поръчка и успешно завършена поръчка — с номера на поръчката, продуктите, количествата и сумите в евро;",
              en: "viewing a product, adding to the basket, starting checkout and a successfully completed order — with the order number, the products, quantities and amounts in euro;",
            },
            {
              bg: "вход в профил и регистрация — само че са се случили, без имейла или профила;",
              en: "signing in and registering — only that it happened, not the email or the account;",
            },
            {
              bg: "технически данни, които SDK-то добавя само: случаен идентификатор на инсталацията, модел на устройството, версия на Android и на приложението, език, приблизителна държава/град (по IP адреса, който Google не съхранява).",
              en: "technical data the SDK adds by itself: a random installation identifier, device model, Android and app version, language, approximate country/city (from the IP address, which Google does not store).",
            },
          ],
        },
        {
          p: {
            bg: "Никога не се изпращат име, имейл, телефон, адрес за доставка, бележки към поръчка, рекламен идентификатор или данни от служебните страници. Рекламните сигнали (ad storage, ad user data, ad personalization) са винаги отказани, а разрешението за рекламен идентификатор е премахнато от приложението.",
            en: "Name, email, phone, delivery address, order notes, the advertising ID and anything from the staff pages are never sent. Advertising signals (ad storage, ad user data, ad personalisation) are always denied, and the advertising-ID permission is removed from the app.",
          },
        },
        {
          p: {
            bg: "Основание: вашето съгласие (чл. 6, ал. 1, б. „а“ ОРЗД). Цел: да разберем как се използва приложението и да го подобряваме. Google пази събитийните данни не повече от 14 месеца. Можете да оттеглите съгласието по всяко време с бутона по-долу (вижда се, когато страницата е отворена в приложението). При оттегляне събирането спира веднага, а идентификаторът на инсталацията и неизпратените данни се изтриват от устройството.",
            en: "Basis: your consent (Art. 6(1)(a) GDPR). Purpose: understanding how the app is used and improving it. Google keeps the event-level data for no longer than 14 months. You may withdraw consent at any time with the button below (shown when this page is opened in the app). On withdrawal collection stops at once, and the installation identifier and any unsent data are deleted from the device.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "3. Какво се пази на самото устройство",
        en: "3. What is stored on the device itself",
      },
      blocks: [
        {
          p: {
            bg: "Следното се записва само локално, в частното хранилище на приложението, и не напуска устройството:",
            en: "The following is stored only locally, in the app's private storage, and never leaves the device:",
          },
        },
        {
          list: [
            {
              bg: "Сесията ви, ако сте влезли: обикновена httpOnly бисквитка в хранилището на WebView, точно както в браузър. Тя не се архивира в Google Drive и не се прехвърля на друго устройство — автоматичното архивиране на приложението е изключено нарочно.",
              en: "Your session, if you are signed in: an ordinary httpOnly cookie in the WebView's cookie store, exactly as in a browser. It is not backed up to Google Drive and is not carried across to another device — the app's automatic backup is deliberately disabled.",
            },
            {
              bg: "Съдържанието на количката ви, докато не я изпразните или не завършите поръчката.",
              en: "The contents of your basket, until you empty it or complete the order.",
            },
            {
              bg: "Само за служебни устройства: настройките на Bluetooth принтера — име и адрес на избрания сдвоен принтер, ширина на хартията, кодировка и подобни технически предпочитания, плюс текста на последната грешка при печат.",
              en: "On staff devices only: the Bluetooth printer settings — the name and address of the selected paired printer, paper width, character encoding and similar technical preferences, plus the text of the last printing error.",
            },
            {
              bg: "Вашият избор за статистиката за употреба и кога сте го направили, както и номерата на вече отчетените поръчки (за да не се отчете една поръчка два пъти).",
              en: "Your choice about usage statistics and when you made it, plus the numbers of orders already reported (so that one order is never reported twice).",
            },
          ],
        },
        {
          p: {
            bg: "Приложението не пази пароли и не чете паролите, които въвеждате в сайта.",
            en: "The app stores no passwords and does not read the passwords you type into the website.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "4. Разрешения и защо са нужни",
        en: "4. Permissions and why they are needed",
      },
      blocks: [
        {
          list: [
            {
              bg: "Интернет и състояние на мрежата — за зареждане на страниците и за екрана „няма връзка“. Не изискват вашето потвърждение.",
              en: "Internet and network state — to load the pages and to show the “no connection” screen. Neither asks for your confirmation.",
            },
            {
              bg: "Bluetooth (свързване с устройства наблизо) — само за служебната функция за печат на кухненски бележки.",
              en: "Bluetooth (connect to nearby devices) — only for the staff feature that prints kitchen tickets.",
            },
          ],
        },
        {
          p: {
            bg: "За Bluetooth разрешението има какво да се уточни, защото е единственото, което приложението изобщо би поискало от вас. То НЕ се иска при стартиране и НЕ е нужно, за да поръчате. Диалогът се появява само ако някой отвори служебния екран за настройки на принтера и натисне „Избери сдвоен принтер“. Клиент, който просто поръчва пица, никога няма да го види.",
            en: "The Bluetooth permission deserves a note, because it is the only one the app would ever ask you for. It is NOT requested at startup and is NOT needed in order to place an order. The dialog appears only if someone opens the staff printer-settings screen and taps “Select paired printer”. A customer simply ordering a pizza will never see it.",
          },
        },
        {
          p: {
            bg: "Дори тогава приложението не сканира за устройства наоколо — вижда само вече сдвоените в системните настройки на Android. Не иска и не използва достъп до местоположение; разрешението е декларирано с „neverForLocation“ именно за да е ясно, че местоположението не се извлича от него.",
            en: "Even then the app does not scan for nearby devices — it sees only those already paired in Android's own settings. It neither requests nor uses location access; the permission is declared with “neverForLocation” precisely to make clear that no location is derived from it.",
          },
        },
        {
          p: {
            bg: "Приложението не иска достъп до камера, микрофон, снимки, контакти, календар, съобщения или местоположение.",
            en: "The app requests no access to camera, microphone, photos, contacts, calendar, messages or location.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "5. Данни за поръчките при печат (служебна функция)",
        en: "5. Order data when printing (staff feature)",
      },
      blocks: [
        {
          p: {
            bg: "Когато служител отпечата бележка, системата подава на приложението данните за конкретната поръчка (номер, артикули, сума, а при доставка — име, телефон и адрес на клиента). Те се използват само за да бъдат преобразувани в текст и изпратени по Bluetooth към принтера. Приложението не ги записва във файл, не ги качва никъде и ги забравя веднага след печата.",
            en: "When a staff member prints a ticket, the system hands the app the data for that one order (number, items, total and — for deliveries — the customer's name, phone and address). It is used only to be turned into text and sent over Bluetooth to the printer. The app does not write it to a file, does not upload it anywhere, and forgets it as soon as printing finishes.",
          },
        },
        {
          p: {
            bg: "Достъпът до тези данни се решава от сървъра въз основа на служебния профил, а не от приложението. Функцията за печат работи само на служебните страници на системата.",
            en: "Access to that data is decided by the server on the basis of the staff account, not by the app. The printing feature only works on the system's staff pages.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "6. Деца",
        en: "6. Children",
      },
      blocks: [
        {
          p: {
            bg: "Приложението е за поръчка на храна и не е насочено към деца. То не съдържа съдържание, предназначено за деца, и не събира съзнателно данни от лица под 16 години. Поръчка се прави от лице, което може да сключи договор за доставка.",
            en: "The app is for ordering food and is not directed at children. It contains no child-directed content and does not knowingly collect data from anyone under 16. An order is placed by someone able to enter into a delivery contract.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "7. Изтриване на данните",
        en: "7. Deleting your data",
      },
      blocks: [
        {
          p: {
            bg: "Профилът ви може да бъде изтрит по всяко време и от самото приложение: „Профил“ → „Изтриване на профила“ → потвърждение с парола. Изтриването премахва профила, паролата и запазените адреси.",
            en: "Your account can be deleted at any time, from inside the app: “Profile” → “Delete your account” → confirm with your password. Deleting removes the account, the password and the saved addresses.",
          },
        },
        {
          p: {
            bg: "От направените поръчки премахваме и вашето име, имейл, телефон, адрес за доставка и бележката към поръчката. Остава само счетоводната част — номер и дата на поръчката, поръчаните артикули и сумите — която сме задължени да пазим по данъчното и счетоводното законодателство (чл. 17, § 3, б. „б“ ОРЗД). Тези записи вече не съдържат данни, по които може да бъдете идентифицирани.",
            en: "From the orders you have already placed we also remove your name, email, phone number, delivery address and order note. Only the accounting part remains — the order number and date, the items ordered and the amounts — which we are required to keep under tax and accounting law (GDPR Art. 17(3)(b)). Those records no longer contain anything that identifies you.",
          },
        },
        {
          p: {
            bg: "Единственото изключение е поръчка, която в момента се приготвя или пътува към вас: адресът ѝ е необходим, за да бъде доставена, затова се премахва веднага щом поръчката бъде доставена или отказана.",
            en: "The one exception is an order that is being cooked or is already on its way to you: its address is what makes the delivery possible, so it is removed as soon as that order is delivered or cancelled.",
          },
        },
        {
          p: {
            bg: "Пълните стъпки, включително как да заявите изтриване, ако вече нямате достъп до профила си или сте деинсталирали приложението, са на страница „Изтриване на профил“ (/account-deletion).",
            en: "The full steps, including how to request deletion if you can no longer sign in or have uninstalled the app, are on the “Account deletion” page (/account-deletion).",
          },
        },
        {
          p: {
            bg: "Данните, които приложението пази на устройството (сесия, количка, а на служебни устройства — настройките на принтера), се изтриват с деинсталирането му или през „Настройки → Приложения → Pizza Pazzo → Изчисти данните“.",
            en: "The data the app keeps on the device (session, basket and, on staff devices, the printer settings) is removed by uninstalling it, or via “Settings → Apps → Pizza Pazzo → Clear data”.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "8. Промени и контакт",
        en: "8. Changes and contact",
      },
      blocks: [
        {
          p: {
            bg: "При промяна във функционалността на приложението обновяваме тази страница и датата над текста. За въпроси относно поверителността използвайте данните за контакт в началото на страницата.",
            en: "If the app's functionality changes we update this page and the date above the text. For privacy questions please use the contact details at the top of this page.",
          },
        },
      ],
    },
  ],
};
