"use client";

import { useEffect, useRef, useState } from "react";
import {
  SIMULATOR_TEST_CARDS,
  checkTestCard,
  formatCardNumber,
  formatExpiry,
  type CardCheck,
} from "@/lib/payments/simulator-cards";

/**
 * The simulator's demo "hosted payment page": card number, MM/YY, CVC, Pay.
 *
 * PRIVACY BY CONSTRUCTION: the three card inputs have no `name` and live
 * OUTSIDE the form that talks to the server. They are checked here, in the
 * browser, against the simulator's test numbers; the only thing ever sent is
 * the resulting scenario ("paid", "declined", …) in a separate form with two
 * hidden fields. The inputs are wiped before that form is submitted.
 *
 * Only the listed test numbers are accepted. A number that looks like a real
 * card is refused and cleared on the spot.
 */

type Scenario =
  | "paid"
  | "declined"
  | "cancelled"
  | "pending"
  | "latePaid"
  | "lateAfterDecline"
  | "unreachable"
  | "duplicateCallback"
  | "amountMismatch";

type Step = "form" | "processing" | "challenge" | "redirecting";

const T = {
  bg: {
    warning: "Тестов симулатор — без реални пари; не въвеждайте истинска карта.",
    warningSub:
      "Това НЕ е банка. Номерата по-долу работят само в демото на Pizza Pazzo и не доказват нищо за бъдещата банка.",
    merchant: "Търговец",
    order: "Поръчка",
    amount: "Сума за плащане",
    cardNumber: "Номер на тестова карта",
    expiry: "Валидност (ММ/ГГ)",
    cvc: "Тестов CVC",
    pay: "Плати",
    cancel: "Отказ — връщане в Pizza Pazzo",
    processing: "Обработваме плащането…",
    processingSub: "Не затваряйте страницата.",
    redirecting: "Връщане към Pizza Pazzo…",
    testCards: "Тестови карти на симулатора",
    fill: "Попълни",
    anyFuture: "Валидност: всяка бъдеща дата, CVC: всякакви 3 цифри.",
    challengeTitle: "Симулиран 3-D Secure",
    challengeSub:
      "Това е СИМУЛАЦИЯ на потвърждението от банката на картодържателя — не е истинска 3-D Secure проверка.",
    challengeQ: "Потвърждавате ли плащане от {amount} към Pizza Pazzo?",
    confirm: "Потвърди",
    reject: "Откажи",
    advanced: "Разширени тестови сценарии (без карта)",
    advancedSub: "За проверка на по-редки случаи — изпращат само избрания сценарий.",
    errors: {
      NUMBER_INCOMPLETE: "Въведете 16-цифрения номер на тестова карта.",
      NOT_TEST_CARD: "Това не е тестова карта на симулатора. Използвайте номер от списъка по-долу.",
      NOT_TEST_CARD_REAL_LOOKING:
        "Този номер прилича на истинска карта и беше изтрит. Не въвеждайте истински карти — използвайте номер от списъка по-долу.",
      EXPIRY_INVALID: "Въведете валидност във формат ММ/ГГ.",
      EXPIRY_PAST: "Валидността е изтекла — въведете бъдеща дата.",
      CVC_INVALID: "CVC трябва да е 3 цифри.",
    },
  },
  en: {
    warning: "Test simulator — no real money; do not enter a real card.",
    warningSub:
      "This is NOT a bank. The numbers below only work in the Pizza Pazzo demo and prove nothing about the future bank.",
    merchant: "Merchant",
    order: "Order",
    amount: "Amount to pay",
    cardNumber: "Test card number",
    expiry: "Expiry (MM/YY)",
    cvc: "Test CVC",
    pay: "Pay",
    cancel: "Cancel — back to Pizza Pazzo",
    processing: "Processing your payment…",
    processingSub: "Please do not close this page.",
    redirecting: "Returning to Pizza Pazzo…",
    testCards: "Simulator test cards",
    fill: "Fill in",
    anyFuture: "Expiry: any future date, CVC: any 3 digits.",
    challengeTitle: "Simulated 3-D Secure",
    challengeSub:
      "This SIMULATES the cardholder's bank confirmation — it is not a real 3-D Secure check.",
    challengeQ: "Do you confirm a payment of {amount} to Pizza Pazzo?",
    confirm: "Confirm",
    reject: "Reject",
    advanced: "Advanced test scenarios (no card)",
    advancedSub: "For rarer cases — they only send the chosen scenario.",
    errors: {
      NUMBER_INCOMPLETE: "Enter the 16-digit test card number.",
      NOT_TEST_CARD: "That is not a simulator test card. Use a number from the list below.",
      NOT_TEST_CARD_REAL_LOOKING:
        "That number looks like a real card and was cleared. Do not enter real cards — use a number from the list below.",
      EXPIRY_INVALID: "Enter the expiry as MM/YY.",
      EXPIRY_PAST: "That date has passed — enter a future one.",
      CVC_INVALID: "The CVC must be 3 digits.",
    },
  },
} as const;

const PROCESSING_MS = 1600;

export function SimulatorCheckout({
  sessionId,
  locale,
  amountLabel,
  orderNumber,
  reference,
  decide,
  advancedScenarios,
}: {
  sessionId: string;
  locale: "bg" | "en";
  amountLabel: string;
  orderNumber: number | null;
  reference: string;
  /** The server action that records the scenario (only the scenario). */
  decide: (formData: FormData) => Promise<void>;
  advancedScenarios: { key: Scenario; label: string }[];
}) {
  const t = T[locale];
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<Extract<CardCheck, { ok: false }> | null>(null);
  const [step, setStep] = useState<Step>("form");
  const decisionForm = useRef<HTMLFormElement>(null);
  const scenarioInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nothing typed here outlives the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function wipeCard() {
    setNumber("");
    setExpiry("");
    setCvc("");
  }

  /** Sends ONLY the scenario. The card fields are already empty by now. */
  function submitScenario(scenario: Scenario) {
    wipeCard();
    setStep("redirecting");
    if (scenarioInput.current) scenarioInput.current.value = scenario;
    decisionForm.current?.requestSubmit();
  }

  function onPay(e: React.FormEvent) {
    e.preventDefault();
    const result = checkTestCard({ number, expiry, cvc });
    if (!result.ok) {
      if (result.code === "NOT_TEST_CARD_REAL_LOOKING") setNumber("");
      setError(result);
      return;
    }
    setError(null);
    const behaviour = result.card.behaviour.kind;
    wipeCard();
    setStep("processing");
    timer.current = setTimeout(() => {
      if (behaviour === "challenge") setStep("challenge");
      else submitScenario(behaviour);
    }, PROCESSING_MS);
  }

  function fillWith(cardNumber: string) {
    setNumber(formatCardNumber(cardNumber));
    const next = new Date();
    const yy = String((next.getFullYear() + 3) % 100).padStart(2, "0");
    setExpiry(`12/${yy}`);
    setCvc("123");
    setError(null);
  }

  const busy = step !== "form";
  const errorText = error ? t.errors[error.code] : null;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div role="alert" className="rounded-2xl border-2 border-amber-500 bg-amber-100 p-4">
          <p className="font-extrabold text-amber-950">⚠ {t.warning}</p>
          <p className="mt-1 text-sm text-amber-900">{t.warningSub}</p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">{t.merchant}</span>
              <span className="font-semibold">Pizza Pazzo (TEST)</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">{t.order}</span>
              <span className="font-mono">
                {orderNumber ? `№${orderNumber}` : ""} <span className="text-slate-400">{reference}</span>
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-sm text-slate-500">{t.amount}</span>
              <span className="text-3xl font-bold tracking-tight" data-testid="sim-amount">
                {amountLabel}
              </span>
            </div>
          </div>

          {step === "form" && (
            <form onSubmit={onPay} noValidate className="space-y-4 px-5 py-5" data-testid="sim-card-form">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t.cardNumber}</span>
                <input
                  // No `name`: this field can never be part of a submitted form.
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="4242 4242 4242 4242"
                  value={number}
                  onChange={(e) => setNumber(formatCardNumber(e.target.value))}
                  aria-invalid={error?.field === "number"}
                  data-testid="sim-card-number"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg tracking-wider outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t.expiry}</span>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12/29"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    aria-invalid={error?.field === "expiry"}
                    data-testid="sim-card-expiry"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t.cvc}</span>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="123"
                    maxLength={3}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    aria-invalid={error?.field === "cvc"}
                    data-testid="sim-card-cvc"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>
              </div>

              {errorText && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" data-testid="sim-error">
                  {errorText}
                </p>
              )}

              <button
                type="submit"
                data-testid="sim-pay"
                className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-lg font-semibold text-white transition hover:bg-slate-800"
              >
                {t.pay} {amountLabel}
              </button>
              <button
                type="button"
                onClick={() => submitScenario("cancelled")}
                className="w-full rounded-xl px-4 py-2 text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
              >
                {t.cancel}
              </button>
            </form>
          )}

          {(step === "processing" || step === "redirecting") && (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center" aria-live="polite" data-testid="sim-processing">
              <div aria-hidden className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
              <p className="text-lg font-semibold">{step === "processing" ? t.processing : t.redirecting}</p>
              <p className="text-sm text-slate-500">{t.processingSub}</p>
            </div>
          )}

          {step === "challenge" && (
            <div className="space-y-4 px-5 py-6" data-testid="sim-3ds">
              <div className="rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50 p-4">
                <p className="font-bold text-indigo-900">{t.challengeTitle}</p>
                <p className="mt-1 text-sm text-indigo-800">{t.challengeSub}</p>
              </div>
              <p className="text-center font-medium">{t.challengeQ.replace("{amount}", amountLabel)}</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => submitScenario("declined")}
                  data-testid="sim-3ds-reject"
                  className="rounded-xl border-2 border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50"
                >
                  {t.reject}
                </button>
                <button
                  type="button"
                  onClick={() => submitScenario("paid")}
                  data-testid="sim-3ds-confirm"
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500"
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The ONLY thing that reaches the server: the session and a scenario. */}
        <form ref={decisionForm} action={decide} className="hidden">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input ref={scenarioInput} type="hidden" name="scenario" defaultValue="" />
        </form>

        {!busy && (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.testCards}</h2>
              <ul className="mt-3 space-y-2">
                {SIMULATOR_TEST_CARDS.map((c) => (
                  <li key={c.number} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm">{formatCardNumber(c.number)}</p>
                      <p className="text-xs text-slate-500">{c.label[locale]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fillWith(c.number)}
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      {t.fill}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">{t.anyFuture}</p>
            </section>

            <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t.advanced}</summary>
              <p className="mt-2 text-xs text-slate-500">{t.advancedSub}</p>
              <div className="mt-3 grid gap-2">
                {advancedScenarios.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => submitScenario(s.key)}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-left text-sm font-medium hover:bg-slate-200"
                  >
                    {s.label}
                    <span className="block font-mono text-xs text-slate-500">{s.key}</span>
                  </button>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
