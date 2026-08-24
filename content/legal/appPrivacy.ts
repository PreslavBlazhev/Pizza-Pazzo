import type { LegalDoc } from "./types";

/**
 * Политика за поверителност на Android приложението „Pizza Pazzo Kitchen“.
 *
 * Google Play изисква публичен URL с политика за поверителност за всяко
 * приложение — включително за такова, което не събира нищо. Затова документът
 * е отделен от `privacy.ts`: онзи описва сайта и клиентските поръчки, този
 * описва какво прави приложението на кухненския таблет.
 *
 * Съдържанието трябва да съответства едно към едно на попълнения в Play
 * Console формуляр „Data safety“ — виж android-kitchen-app/PLAY_STORE.md.
 * Ако приложението някога започне да събира нещо, ПЪРВО се обновява този
 * текст, после формулярът.
 */
export const appPrivacyDoc: LegalDoc = {
  slug: "app-privacy",
  updated: "24.08.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази политика се отнася за Android приложението „Pizza Pazzo Kitchen“ (пакет pizzapazzo.kitchen) — служебен инструмент за персонала на Pizza Pazzo, който показва сайта на заведението на кухненския таблет и печата бележки за поръчки на Bluetooth термален принтер. За личните данни, които обработваме чрез самия сайт, важи отделната Политика за поверителност.",
        en: "This policy covers the “Pizza Pazzo Kitchen” Android app (package pizzapazzo.kitchen) — an internal tool for Pizza Pazzo staff that displays the restaurant's website on the kitchen tablet and prints order tickets on a Bluetooth thermal printer. Personal data processed through the website itself is covered by our separate Privacy Policy.",
      },
    },
  ],
  sections: [
    {
      heading: {
        bg: "1. Приложението не събира лични данни",
        en: "1. The app collects no personal data",
      },
      blocks: [
        {
          p: {
            bg: "Приложението не изисква регистрация в него, не създава профил и не изпраща никакви данни към разработчика или към трети страни. В него няма реклами, няма аналитика, няма проследяване и няма SDK-та на трети страни.",
            en: "The app requires no sign-up of its own, creates no profile, and sends no data to the developer or to any third party. It contains no ads, no analytics, no tracking and no third-party SDKs.",
          },
        },
        {
          p: {
            bg: "Единствената мрежова комуникация на приложението е зареждането на страниците на pizzapazzo.bg (и pizza-pazzo.onrender.com) по HTTPS — точно както би направил браузър.",
            en: "The app's only network traffic is loading pages from pizzapazzo.bg (and pizza-pazzo.onrender.com) over HTTPS — exactly as a browser would.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "2. Какво се пази на самия таблет",
        en: "2. What is stored on the tablet itself",
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
              bg: "Настройки на принтера: име и Bluetooth адрес на избрания сдвоен принтер, ширина на хартията, кодировка, брой символи на ред и подобни технически предпочитания.",
              en: "Printer settings: the name and Bluetooth address of the selected paired printer, paper width, character encoding, characters per line and similar technical preferences.",
            },
            {
              bg: "Адресът на началната страница, която приложението отваря.",
              en: "The address of the start page the app opens.",
            },
            {
              bg: "Текстът на последната грешка при печат — за диагностика.",
              en: "The text of the last printing error — for diagnostics.",
            },
            {
              bg: "Сесията на служителя, влязъл в сайта: обикновена httpOnly бисквитка в хранилището на WebView, точно както в браузър. Тя не се архивира в Google Drive — автоматичното архивиране на приложението е изключено нарочно.",
              en: "The signed-in staff member's session: an ordinary httpOnly cookie in the WebView's cookie store, exactly as in a browser. It is not backed up to Google Drive — the app's auto-backup is deliberately disabled.",
            },
          ],
        },
        {
          p: {
            bg: "Приложението не пази пароли и не чете паролите, въведени в сайта.",
            en: "The app stores no passwords and does not read the passwords typed into the website.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "3. Разрешения и защо са нужни",
        en: "3. Permissions and why they are needed",
      },
      blocks: [
        {
          list: [
            {
              bg: "Интернет и състояние на мрежата — за зареждане на страниците на сайта и за екрана „няма връзка“.",
              en: "Internet and network state — to load the website's pages and to show the “no connection” screen.",
            },
            {
              bg: "Bluetooth (свързване с устройства наблизо) — единствено за връзка с вече сдвоения термален принтер, за да се отпечата бележката. Приложението не сканира за устройства, вижда само вече сдвоените, не иска и не използва достъп до местоположение, и разрешението е декларирано с „neverForLocation“.",
              en: "Bluetooth (connect to nearby devices) — solely to connect to the already-paired thermal printer in order to print a ticket. The app does not scan for devices, sees only already-paired ones, neither requests nor uses location access, and the permission is declared with “neverForLocation”.",
            },
          ],
        },
      ],
    },
    {
      heading: {
        bg: "4. Данни за поръчките, които се печатат",
        en: "4. Order data that gets printed",
      },
      blocks: [
        {
          p: {
            bg: "Когато служител отпечата бележка, сайтът подава на приложението данните за конкретната поръчка (номер, артикули, сума, а при доставка — име, телефон и адрес на клиента). Тези данни се използват само за да бъдат преобразувани в текст и изпратени по Bluetooth към принтера. Приложението не ги записва във файл, не ги качва никъде и ги забравя веднага след печата.",
            en: "When a staff member prints a ticket, the website hands the app the data for that one order (number, items, total and — for deliveries — the customer's name, phone and address). This data is used only to be turned into text and sent over Bluetooth to the printer. The app does not write it to a file, does not upload it anywhere, and forgets it as soon as printing finishes.",
          },
        },
        {
          p: {
            bg: "Администратор на данните на клиентите е Pizza Pazzo LTD; основанията и сроковете за обработката им са описани в Политиката за поверителност на сайта.",
            en: "The controller of customer data is Pizza Pazzo LTD; the legal bases and retention periods are described in the website's Privacy Policy.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "5. Деца",
        en: "5. Children",
      },
      blocks: [
        {
          p: {
            bg: "Приложението е служебен инструмент и не е предназначено за деца. То не съдържа съдържание, насочено към деца, и не събира данни от когото и да било.",
            en: "The app is an internal work tool and is not directed at children. It contains no child-directed content and collects no data from anyone.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "6. Изтриване на данните",
        en: "6. Deleting the data",
      },
      blocks: [
        {
          p: {
            bg: "Тъй като всичко се пази само на устройството, деинсталирането на приложението (или „Настройки → Приложения → Pizza Pazzo Kitchen → Изчисти данните“) изтрива окончателно настройките и сесията. Няма акаунт в приложението, който да бъде изтриван от наша страна. За заявка относно данни, обработени през сайта, пишете на посочения по-долу имейл.",
            en: "Because everything is kept on the device only, uninstalling the app (or “Settings → Apps → Pizza Pazzo Kitchen → Clear data”) permanently removes the settings and the session. There is no in-app account for us to delete. For any request about data processed through the website, write to the email address below.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "7. Промени и контакт",
        en: "7. Changes and contact",
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
