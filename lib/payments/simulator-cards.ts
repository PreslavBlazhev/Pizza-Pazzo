/**
 * Test cards of OUR payment simulator — pure, dependency-free, browser-safe.
 *
 * These numbers exist only for the Pizza Pazzo demo. They are NOT a bank's
 * test cards, prove nothing about any bank, and must never be sent to one.
 *
 * The card form on the simulator page checks everything here IN THE BROWSER
 * and sends the server only the resulting scenario ("paid", "declined", …).
 * Anything that is not one of these numbers is refused — including a number
 * that passes the Luhn check, which is what a real card looks like — so a
 * real card cannot be "paid" with, and nothing card-like leaves the page.
 */

/** What a test card does. `challenge` = the simulated 3-D Secure step first. */
export type TestCardBehaviour =
  | { kind: "paid" }
  | { kind: "declined" }
  | { kind: "challenge" }
  | { kind: "pending" };

export interface TestCard {
  number: string; // digits only
  label: { bg: string; en: string };
  behaviour: TestCardBehaviour;
}

export const SIMULATOR_TEST_CARDS: readonly TestCard[] = [
  {
    number: "4242424242424242",
    label: { bg: "Успешно плащане", en: "Payment succeeds" },
    behaviour: { kind: "paid" },
  },
  {
    number: "4000000000009995",
    label: { bg: "Отказано (недостатъчна наличност)", en: "Declined (insufficient funds)" },
    behaviour: { kind: "declined" },
  },
  {
    number: "4000002760003184",
    label: {
      bg: "Симулиран 3-D Secure — вие решавате потвърждение/отказ",
      en: "Simulated 3-D Secure — you confirm or reject",
    },
    behaviour: { kind: "challenge" },
  },
  {
    number: "4000000000000077",
    label: { bg: "Чакащо — банката още не е решила", en: "Pending — no final answer yet" },
    behaviour: { kind: "pending" },
  },
] as const;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** "4242424242424242" → "4242 4242 4242 4242" (as the customer types). */
export function formatCardNumber(value: string): string {
  return digitsOnly(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1228" / "12/28" → "12/28" (as the customer types). */
export function formatExpiry(value: string): string {
  const d = digitsOnly(value).slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

/** The Luhn checksum — true for anything shaped like a real card number. */
export function passesLuhn(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export type CardCheck =
  | { ok: true; card: TestCard }
  | {
      ok: false;
      field: "number" | "expiry" | "cvc";
      /** NOT_TEST_CARD_REAL_LOOKING = it passes Luhn: probably a real card. */
      code:
        | "NUMBER_INCOMPLETE"
        | "NOT_TEST_CARD"
        | "NOT_TEST_CARD_REAL_LOOKING"
        | "EXPIRY_INVALID"
        | "EXPIRY_PAST"
        | "CVC_INVALID";
    };

/**
 * Validates the demo form. `now` is injectable for the tests. The expiry is
 * valid through the last day of its month, like a real card's.
 */
export function checkTestCard(
  input: { number: string; expiry: string; cvc: string },
  now: Date = new Date()
): CardCheck {
  const digits = digitsOnly(input.number);
  if (digits.length < 16) return { ok: false, field: "number", code: "NUMBER_INCOMPLETE" };
  const card = SIMULATOR_TEST_CARDS.find((c) => c.number === digits);
  if (!card) {
    return {
      ok: false,
      field: "number",
      code: passesLuhn(digits) ? "NOT_TEST_CARD_REAL_LOOKING" : "NOT_TEST_CARD",
    };
  }

  const m = /^(\d{2})\/(\d{2})$/.exec(input.expiry.trim());
  if (!m) return { ok: false, field: "expiry", code: "EXPIRY_INVALID" };
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return { ok: false, field: "expiry", code: "EXPIRY_INVALID" };
  const endOfMonth = new Date(year, month, 1); // first moment of the NEXT month
  if (endOfMonth <= now) return { ok: false, field: "expiry", code: "EXPIRY_PAST" };

  if (!/^\d{3}$/.test(input.cvc.trim())) return { ok: false, field: "cvc", code: "CVC_INVALID" };

  return { ok: true, card };
}
