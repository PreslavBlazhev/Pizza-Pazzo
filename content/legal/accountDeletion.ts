import type { LegalDoc } from "./types";

/**
 * Публична страница „Изтриване на профил“.
 *
 * Google Play изисква от всяко приложение, което позволява регистрация, ДВА
 * пътя за изтриване: вътре в приложението (профил → „Изтрий профила ми“) и
 * публичен уеб адрес, достъпен и от някой, който вече е деинсталирал
 * приложението. Тази страница е вторият път и адресът ѝ се попълва в Play
 * Console → Data safety → Data deletion.
 *
 * Изискванията на Google към страницата: да се отваря без грешка, изтриването
 * да е основната ѝ тема, и да се вижда името на приложението/разработчика,
 * както е в листинга — затова „Pizza Pazzo“ е изписано изрично.
 *
 * Текстът трябва да съвпада с това, което кодът реално прави
 * (`deleteOwnAccount` в app/actions/auth.ts). Смени ли се едното, сменя се и
 * другото.
 */
export const accountDeletionDoc: LegalDoc = {
  slug: "account-deletion",
  updated: "24.08.2026",
  showCompanyBox: true,
  intro: [
    {
      p: {
        bg: "Тази страница обяснява как да изтриете профила си в Pizza Pazzo — независимо дали го ползвате през сайта www.pizzapazzo.bg, или през Android приложението „Pizza Pazzo“.",
        en: "This page explains how to delete your Pizza Pazzo account — whether you use it through the www.pizzapazzo.bg website or through the “Pizza Pazzo” Android app.",
      },
    },
  ],
  sections: [
    {
      heading: {
        bg: "1. Изтриване от профила ви (най-бързият начин)",
        en: "1. Deleting it yourself from your profile (fastest)",
      },
      blocks: [
        {
          list: [
            {
              bg: "Влезте в профила си на www.pizzapazzo.bg (или в приложението, което отваря същия сайт).",
              en: "Sign in at www.pizzapazzo.bg (or in the app, which opens the same website).",
            },
            {
              bg: "Отворете „Профил“.",
              en: "Open “Profile”.",
            },
            {
              bg: "Най-долу изберете „Изтриване на профила“ → „Изтрий профила ми“.",
              en: "At the bottom choose “Delete your account” → “Delete my account”.",
            },
            {
              bg: "Въведете паролата си за потвърждение и натиснете „Да, изтрий профила“.",
              en: "Enter your password to confirm and press “Yes, delete my account”.",
            },
          ],
        },
        {
          p: {
            bg: "Изтриването е незабавно и необратимо. Веднага след него сте извън профила си.",
            en: "Deletion is immediate and irreversible. You are signed out the moment it happens.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "2. Ако вече нямате достъп до профила си",
        en: "2. If you can no longer sign in",
      },
      blocks: [
        {
          p: {
            bg: "Пишете ни от имейла, с който сте се регистрирали, на адреса за контакт по-горе, с тема „Изтриване на профил“. Ще изтрием профила до 30 дни от заявката и ще ви отговорим, когато е направено. Може да поискаме потвърждение, че заявката идва от вас — само за да не изтрием чужд профил.",
            en: "Write to us from the email address you registered with, to the contact address above, with the subject “Account deletion”. We will delete the account within 30 days of the request and reply when it is done. We may ask you to confirm the request came from you — only so that we do not delete someone else's account.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "3. Какво се изтрива",
        en: "3. What gets deleted",
      },
      blocks: [
        {
          list: [
            {
              bg: "Профилът ви: име, имейл, телефон и паролата (която и без това се пази само като необратим хеш).",
              en: "Your account: name, email, phone and password (which is only ever stored as an irreversible hash anyway).",
            },
            {
              bg: "Всички запазени адреси за доставка.",
              en: "All your saved delivery addresses.",
            },
            {
              bg: "Връзката между вас и предишните ви поръчки — те престават да сочат към профил.",
              en: "The link between you and your past orders — they stop pointing at any account.",
            },
            {
              bg: "Вашите данни вътре в тези поръчки: име, имейл, телефон, адрес за доставка и бележката към поръчката. Те се заличават от записа, а не просто се откачат от профила.",
              en: "Your details inside those orders: name, email, phone, delivery address and the note you left. They are erased from the record, not merely detached from the account.",
            },
          ],
        },
      ],
    },
    {
      heading: {
        bg: "4. Какво остава и защо",
        en: "4. What stays, and why",
      },
      blocks: [
        {
          p: {
            bg: "Остава счетоводната част на поръчката: нейният номер и дата, поръчаните артикули и сумите. Това не е избор — счетоводното и данъчното законодателство изисква документите за продажби да се пазят определен срок, а Общият регламент относно защитата на данните изрично допуска обработване, необходимо за спазване на законово задължение (чл. 17, § 3, б. „б“). След заличаването по тези записи не може да бъдете идентифицирани.",
            en: "What stays is the accounting part of the order: its number and date, the items ordered and the amounts. This is not a choice: accounting and tax law require sales documents to be kept for a set period, and the GDPR explicitly permits processing necessary for compliance with a legal obligation (Art. 17(3)(b)). Once your details are erased, those records cannot identify you.",
          },
        },
        {
          p: {
            bg: "Едно изключение: поръчка, която в момента се приготвя или вече пътува към вас, запазва адреса си, докато бъде доставена или отказана — без него куриерът няма къде да отиде. Веднага след това адресът се заличава автоматично.",
            en: "One exception: an order that is being cooked or is already on its way keeps its address until it is delivered or cancelled — without it the driver has nowhere to go. It is erased automatically the moment that happens.",
          },
        },
        {
          p: {
            bg: "След изтичането на този срок записите се унищожават по общия ред. Подробностите за сроковете са в Политиката за поверителност.",
            en: "Once that period expires the records are destroyed in the ordinary way. The retention periods are set out in the Privacy Policy.",
          },
        },
      ],
    },
    {
      heading: {
        bg: "5. Приложението „Pizza Pazzo“",
        en: "5. The “Pizza Pazzo” app",
      },
      blocks: [
        {
          p: {
            bg: "Приложението няма собствен, отделен профил — то използва същия профил като сайта. Настройките, които то пази на самото устройство (избран Bluetooth принтер, ширина на хартията и подобни), се изтриват с деинсталирането му или през „Настройки → Приложения → Pizza Pazzo → Изчисти данните“.",
            en: "The app has no separate account of its own — it uses the same account as the website. The settings it keeps on the device itself (the selected Bluetooth printer, paper width and the like) are removed by uninstalling it, or via “Settings → Apps → Pizza Pazzo → Clear data”.",
          },
        },
      ],
    },
  ],
};
