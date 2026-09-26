/**
 * The card-demo switch values — pure, browser-safe (the admin form imports
 * them). The server side lives in ./demo.ts.
 */
export const CARD_DEMO_MODES = ["OFF", "STAFF", "EVERYONE"] as const;
export type CardDemoMode = (typeof CARD_DEMO_MODES)[number];

export function isCardDemoMode(value: unknown): value is CardDemoMode {
  return typeof value === "string" && (CARD_DEMO_MODES as readonly string[]).includes(value);
}

export const CARD_DEMO_MODE_LABELS: Record<CardDemoMode, string> = {
  OFF: "Изключено",
  STAFF: "Само за влезли служители и админи",
  EVERYONE: "За всички посетители",
};
