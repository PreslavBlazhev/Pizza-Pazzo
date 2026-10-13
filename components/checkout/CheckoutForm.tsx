"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormAlert } from "@/components/ui/FormAlert";
import { CartSummary } from "@/components/cart/CartSummary";
import { StoreClosedBanner } from "@/components/store/StoreClosedBanner";
import { useStoreClosed } from "@/components/store/StoreStatusProvider";
import { useUnavailableProducts } from "@/components/cart/useUnavailableProducts";
import { armCheckoutTrace, traceStage } from "@/lib/checkout/trace";
import {
  linePreviewTotalEur,
  lineUnitPreviewEur,
  useCartHydrated,
  useCartStore,
} from "@/store/cart-store";
import { formatEurPrice } from "@/lib/format-price";
import {
  deliveryTownsLabel,
  DELIVERY_AREA,
  minimumOrderShortfallEur,
} from "@/lib/delivery-area";
import { MinimumOrderNotice } from "@/components/cart/MinimumOrderNotice";
import { cartExtraName, cartLineIssue, cartProductName, cartVariantName } from "@/lib/cart-display";
import { CONSENT_FIELDS, type ConsentField } from "@/lib/validators/checkout";
import { CardBrandMarks } from "@/components/payment/CardBrandMarks";
import type { CardBrandMark } from "@/lib/payments/card-marks";
import {
  checkoutAttemptStatus,
  createOrder,
  type CheckoutResult,
} from "@/app/actions/checkout";
import {
  clearPendingPayment,
  newCheckoutKey,
  rememberPendingPayment,
} from "@/components/checkout/pending-payment";

interface Props {
  /** Prefilled contact details for a signed-in user. */
  defaults?: { name?: string; email?: string; phone?: string };
  /**
   * Whether the server currently offers card payment (configuration + kill
   * switch). The server re-checks it on submit, so a stale page cannot
   * sneak a card order through after the switch was turned off.
   */
  cardAvailable?: boolean;
  /** The card option is the live-site DEMO (simulator, no real money). */
  cardIsDemo?: boolean;
  /** Approved card marks — empty until real card payment is live. */
  cardMarks?: CardBrandMark[];
}

type PaymentChoice = "cash_on_delivery" | "card_online";

/**
 * Every field the customer MUST fill, in the order they appear on the page.
 * The order matters: it decides which field the page scrolls to when several
 * are missing, and the order the popup lists them in.
 *
 * The delivery note is deliberately absent — it is the one optional field.
 */
const TEXT_FIELDS = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "deliveryAddress",
] as const;

/**
 * Text fields first, then the three explicit confirmations — the order the
 * page scrolls through when several are missing. The confirmations are
 * required on the SERVER too (lib/checkout/place-order.ts); this only says so
 * before the round-trip.
 */
const REQUIRED_FIELDS = [...TEXT_FIELDS, ...CONSENT_FIELDS] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type RequiredField = (typeof REQUIRED_FIELDS)[number];
type FormValues = Record<TextField | "deliveryNote", string>;

/** The one town we deliver to — shown, not typed (lib/delivery-area.ts), in
 *  the reader's language; the server stores it in its canonical BG spelling. */
const deliveryTownFor = (locale: string) =>
  locale === "en" ? DELIVERY_AREA.towns[0].en : DELIVERY_AREA.towns[0].bg;

/**
 * What the customer has typed and ticked, kept in sessionStorage for this tab
 * only — so switching BG ⇄ EN (which reloads the page in the other language)
 * does not wipe the form. Cleared once an order is placed.
 */
const DRAFT_KEY = "pp-checkout-draft";

interface CheckoutDraft {
  values?: Partial<Record<string, string>>;
  paymentMethod?: string;
  consents?: Partial<Record<ConsentField, boolean>>;
}

function readDraft(): CheckoutDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
  } catch {
    return null;
  }
}

/**
 * The idempotency key of the checkout attempt in progress, kept for this tab
 * until an order is confirmed. It used to be drawn afresh on every mount, so
 * an order whose reply was lost (a reload, a language switch or a navigation
 * mid-request, a dropped connection) could be submitted again under a NEW key
 * — a second, duplicate order. Kept here, the retry carries the same key and
 * the server hands back the order that already exists.
 */
const KEY_STORAGE = "pp-checkout-key";

function readStoredKey(): string | null {
  try {
    return window.sessionStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

function storeKey(key: string | null): void {
  try {
    if (key) window.sessionStorage.setItem(KEY_STORAGE, key);
    else window.sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage blocked — the key still lives for this page.
  }
}

function writeDraft(draft: CheckoutDraft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked (private mode, quota) — the form still works.
  }
}

export function CheckoutForm({
  defaults,
  cardAvailable = false,
  cardIsDemo = false,
  cardMarks = [],
}: Props) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tPayment = useTranslations("payment");
  const locale = useLocale();
  const router = useRouter();

  const hydrated = useCartHydrated();
  const items = useCartStore((s) => s.items);
  const totalsFn = useCartStore((s) => s.totals);
  const clear = useCartStore((s) => s.clear);
  const storeClosed = useStoreClosed();
  const unavailable = useUnavailableProducts(items);

  /**
   * The last answer from the server, and whether one is being awaited. The
   * action is called by hand (not through useActionState) so that a request
   * that FAILS — a 500, a dropped connection, a timeout — lands in the catch
   * below as a readable message, with the form intact. Through useActionState
   * the rejection was rethrown during render and took the whole page down
   * ("Application error: a client-side exception has occurred").
   */
  const [state, setState] = useState<CheckoutResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  /** Synchronous guard: a second click before React re-renders is ignored. */
  const inFlight = useRef(false);
  /** True while an earlier attempt's fate is being looked up on mount. */
  const [checkingPrevious, setCheckingPrevious] = useState(false);

  /**
   * The form is CONTROLLED, and that is the whole fix for "it wiped
   * everything I typed": React resets a `<form action={…}>` once the action
   * comes back, so uncontrolled inputs fell back to their defaults — an empty
   * form — every time an order was refused. Values held in state survive the
   * reset, whether the refusal came from the browser or from the server.
   */
  const [values, setValues] = useState<FormValues>({
    customerName: defaults?.name ?? "",
    customerPhone: defaults?.phone ?? "",
    customerEmail: defaults?.email ?? "",
    deliveryAddress: "",
    deliveryNote: "",
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>("cash_on_delivery");

  /**
   * One key per checkout. Sent with the order so that a double click, a
   * retried request or a resubmission after a network hiccup gives back the
   * order that already exists instead of creating a second one. A fresh key
   * is drawn once an order has been placed.
   */
  const [checkoutKey, setCheckoutKey] = useState<string>("");
  useEffect(() => {
    const stored = readStoredKey();
    if (!stored) {
      const fresh = newCheckoutKey();
      storeKey(fresh);
      setCheckoutKey(fresh);
      return;
    }
    // An earlier attempt from this tab never got (or never showed) its
    // answer. Ask the server whether it created an order before offering
    // the button again.
    setCheckoutKey(stored);
    let cancelled = false;
    setCheckingPrevious(true);
    checkoutAttemptStatus(stored)
      .then((found) => {
        if (!cancelled && found?.ok) setState(found);
      })
      .catch(() => {
        // Unreachable server: the same key goes with the next submit, so it
        // still cannot create a second order.
      })
      .finally(() => {
        if (!cancelled) setCheckingPrevious(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Diagnostics: report an attempt this tab left unfinished (lib/checkout/trace.ts).
  useEffect(() => armCheckoutTrace(), []);
  const traceLocale = locale === "en" ? "en" : "bg";

  /** Fields this browser found empty on the last attempt to submit. */
  const [missing, setMissing] = useState<RequiredField[]>([]);

  /** The confirmations start UNTICKED — the customer ticks each one. */
  const [consents, setConsents] = useState<Record<ConsentField, boolean>>({
    consentTerms: false,
    consentRefunds: false,
    consentPrivacy: false,
  });
  const setConsent = useCallback((field: ConsentField, checked: boolean) => {
    setConsents((prev) => ({ ...prev, [field]: checked }));
    if (checked) setMissing((prev) => prev.filter((f) => f !== field));
  }, []);
  const formRef = useRef<HTMLFormElement>(null);

  // Restore a draft from before a language switch (or a reload), then keep it
  // up to date. The restore runs once, before the first save, so an empty
  // initial state never overwrites the stored draft.
  const draftRestored = useRef(false);
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      if (draft.values) {
        setValues((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(prev) as (keyof FormValues)[]) {
            const v = draft.values?.[key];
            if (typeof v === "string" && v !== "") next[key] = v;
          }
          return next;
        });
      }
      if (draft.paymentMethod === "card_online" && cardAvailable) setPaymentMethod("card_online");
      if (draft.consents) {
        setConsents((prev) => {
          const next = { ...prev };
          for (const field of CONSENT_FIELDS) {
            if (typeof draft.consents?.[field] === "boolean") next[field] = draft.consents[field] as boolean;
          }
          return next;
        });
      }
    }
    draftRestored.current = true;
  }, [cardAvailable]);

  useEffect(() => {
    if (!draftRestored.current) return;
    writeDraft({ values, paymentMethod, consents });
  }, [values, paymentMethod, consents]);

  const setValue = useCallback((field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Typing in a field answers its complaint immediately.
    setMissing((prev) => prev.filter((f) => f !== field));
  }, []);

  const labels: Record<RequiredField, string> = {
    customerName: t("fullName"),
    customerPhone: t("phone"),
    customerEmail: t("emailRequired"),
    deliveryAddress: t("address"),
    consentTerms: t("consentTermsShort"),
    consentRefunds: t("consentRefundsShort"),
    consentPrivacy: t("consentPrivacyShort"),
  };

  /** Scrolls the field into view and puts the cursor in it. */
  const revealField = useCallback((field: string) => {
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus without a second, competing scroll.
    el.focus({ preventScroll: true });
  }, []);

  /**
   * Last line of defence in the browser: refuse to submit while a required
   * field is empty, say which ones, and take the customer to the first of
   * them. The server validates everything again — this only spares the
   * round-trip and, more importantly, makes the reason visible.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Always submitted by hand, never by the native <form action>: React
    // resets a form after its action returns, and that reset silently
    // unticked the confirmation checkboxes in the DOM while their state still
    // said "ticked" — the next submit then posted them as missing. Calling the
    // action ourselves skips the reset; every field here is controlled.
    event.preventDefault();
    traceStage("click", traceLocale);
    const empty = REQUIRED_FIELDS.filter((field) =>
      (CONSENT_FIELDS as readonly string[]).includes(field)
        ? !consents[field as ConsentField]
        : values[field as TextField].trim() === ""
    );
    if (empty.length === 0) {
      setMissing([]);
      void submitOrder(new FormData(event.currentTarget));
      return;
    }
    traceStage("invalid", traceLocale);
    setMissing(empty);
    revealField(empty[0]);
  }

  /**
   * Sends the order once. Whatever happens — refusal, server error, lost
   * connection — the customer stays on this page with everything they typed;
   * only a confirmed order moves them on (the effect below).
   */
  async function submitOrder(data: FormData) {
    if (inFlight.current || !checkoutKey) return;
    inFlight.current = true;
    setIsPending(true);
    data.set("traceId", traceStage("sent", traceLocale));
    try {
      const result = await createOrder(null, data);
      traceStage(result.ok ? "ok" : "refused", traceLocale);
      setState(result);
    } catch {
      traceStage("failed", traceLocale);
      // The request may have reached the server before failing. Ask with the
      // same key; if an order exists, that IS the answer.
      let found: CheckoutResult | null = null;
      try {
        found = await checkoutAttemptStatus(checkoutKey);
      } catch {
        /* still unreachable */
      }
      if (found?.ok) traceStage("recovered", traceLocale);
      setState(found?.ok ? found : { ok: false, error: t("errors.NETWORK") });
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }

  // A rejection from the server deserves the same treatment: jump to the
  // first field it complained about instead of leaving the customer to hunt
  // for the red text.
  useEffect(() => {
    const serverFields = Object.keys(state?.fieldErrors ?? {});
    if (serverFields.length === 0) return;
    const first =
      REQUIRED_FIELDS.find((f) => serverFields.includes(f)) ?? serverFields[0];
    revealField(first);
  }, [state, revealField]);

  // Minimal cart payload sent to the server (prices are recomputed there).
  // Extras travel as identifiers + quantity only — never names or prices.
  const itemsPayload = useMemo(
    () =>
      JSON.stringify(
        items.map((i) => ({
          productId: i.product.id,
          variantId: i.selectedVariant?.id,
          quantity: i.quantity,
          extras: (i.extras ?? []).map((e) => ({
            key: e.key,
            sourceProductId: e.sourceProductId,
            quantity: e.quantity,
          })),
        }))
      ),
    [items]
  );

  // On success. Cash: the order is placed — clear the cart and confirm.
  // Card: the order is saved but NOT paid, so the cart stays until the bank
  // confirms the payment (a declined card must not cost the customer their
  // cart); the payment review screen takes over.
  useEffect(() => {
    if (!state?.ok || !state.orderNumber) return;
    // This attempt is settled: the next checkout gets a new key.
    storeKey(null);
    traceStage("confirm", locale === "en" ? "en" : "bg");
    if (state.paymentMethod === "CARD_ONLINE" && state.accessToken) {
      writeDraft(null);
      rememberPendingPayment({ token: state.accessToken, orderNumber: state.orderNumber });
      router.push(`/checkout/pay/${state.accessToken}`);
      return;
    }
    clear();
    writeDraft(null);
    // A cash order replaces any card payment the customer walked away from.
    clearPendingPayment();
    router.push({
      pathname: "/order-success",
      query: { n: String(state.orderNumber), ...(state.receipt ? { r: state.receipt } : {}) },
    });
  }, [state, clear, router, locale]);

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-3xl bg-pizza-cream-dark/40" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-pizza-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-lg text-pizza-muted">{tCart("empty")}</p>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-full bg-pizza-green px-8 py-3 font-semibold text-white transition hover:bg-pizza-green-dark"
        >
          {tCommon("browseMenu")}
        </Link>
      </div>
    );
  }

  const serverErrors = state?.fieldErrors ?? {};
  const totals = totalsFn();
  // The delivery minimum, on the same preview total the customer sees; the
  // server checks it again on its own prices.
  const belowMinimum = minimumOrderShortfallEur(totals.total) > 0;
  // A basket line whose product is no longer on sale (an old basket).
  const unavailableLines = items.filter((i) => cartLineIssue(i, unavailable) === "unavailable");
  // A topping on its own or a retired "Месна добавка" choice (an old basket):
  // fixed in the basket, where the line says what to do.
  const outdatedLines = items.filter((i) => {
    const issue = cartLineIssue(i, unavailable);
    return issue === "addon-only" || issue === "extras-outdated";
  });

  /** A field's message: this browser's complaint first, then the server's. */
  const errorFor = (field: keyof FormValues | ConsentField) =>
    missing.includes(field as RequiredField)
      ? (CONSENT_FIELDS as readonly string[]).includes(field)
        ? t("consentRequired")
        : t("fieldRequired")
      : serverErrors[field];

  /** A document link inside a confirmation label. Opens in a new tab, so the
   *  cart (kept in this browser) and everything typed here stay untouched. */
  const docLink = (href: "/terms" | "/refunds" | "/privacy" | "/delivery" | "/payment-methods") =>
    function DocLink(chunks: React.ReactNode) {
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener"
          className="font-semibold text-pizza-green underline underline-offset-2 hover:text-pizza-green-dark"
        >
          {chunks}
          <span className="sr-only"> {t("opensInNewTab")}</span>
        </Link>
      );
    };

  const requiredMark = t("required");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      {missing.length > 0 && (
        <MissingFieldsPopup
          title={t("missingFieldsTitle")}
          kept={t("missingFieldsKept")}
          fields={missing.map((f) => labels[f])}
          closeLabel={tCommon("close")}
          goLabel={t("goToField")}
          onClose={() => setMissing([])}
          onGo={() => revealField(missing[0])}
        />
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-6"
        noValidate
      >
        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <input type="hidden" name="items" value={itemsPayload} />
        <input type="hidden" name="checkoutKey" value={checkoutKey} />
        <input type="hidden" name="locale" value={locale} />

        <section className="space-y-3 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("contactDetails")}</h2>
          <Input
            label={t("fullName")}
            name="customerName"
            placeholder={requiredMark}
            value={values.customerName}
            onChange={(e) => setValue("customerName", e.target.value)}
            autoComplete="name"
            error={errorFor("customerName")}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={t("phone")}
              name="customerPhone"
              type="tel"
              placeholder={requiredMark}
              value={values.customerPhone}
              onChange={(e) => setValue("customerPhone", e.target.value)}
              autoComplete="tel"
              error={errorFor("customerPhone")}
            />
            <Input
              label={t("emailRequired")}
              name="customerEmail"
              type="email"
              placeholder={requiredMark}
              value={values.customerEmail}
              onChange={(e) => setValue("customerEmail", e.target.value)}
              autoComplete="email"
              error={errorFor("customerEmail")}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("deliveryDetails")}</h2>
          <Input
            label={t("city")}
            name="deliveryCity"
            value={deliveryTownFor(locale)}
            readOnly
            aria-readonly
            className="bg-pizza-cream/50"
            hint={t("deliveryAreaHint", { towns: deliveryTownsLabel(locale) })}
            error={serverErrors.deliveryCity}
          />
          <Textarea
            label={t("address")}
            id="deliveryAddress"
            name="deliveryAddress"
            placeholder={`${requiredMark} — ${t("addressPlaceholder")}`}
            value={values.deliveryAddress}
            onChange={(e) => setValue("deliveryAddress", e.target.value)}
            error={errorFor("deliveryAddress")}
          />
          {/* The only field nobody has to fill, and it says so. */}
          <Textarea
            label={t("notes")}
            id="deliveryNote"
            name="deliveryNote"
            placeholder={`${t("optional")} — ${t("notesPlaceholder")}`}
            value={values.deliveryNote}
            onChange={(e) => setValue("deliveryNote", e.target.value)}
            error={serverErrors.deliveryNote}
          />
        </section>

        <fieldset className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <legend className="sr-only">{t("payment")}</legend>
          <h2 aria-hidden className="text-lg font-semibold text-pizza-ink">
            {t("payment")}
          </h2>
          <div className="mt-3 grid gap-3">
            <PaymentOption
              value="cash_on_delivery"
              checked={paymentMethod === "cash_on_delivery"}
              onSelect={setPaymentMethod}
              icon="💵"
              title={t("paymentCash")}
              hint={t("paymentCashHint")}
            />
            {cardAvailable ? (
              <PaymentOption
                value="card_online"
                checked={paymentMethod === "card_online"}
                onSelect={setPaymentMethod}
                icon="💳"
                title={cardIsDemo ? t("paymentCardDemo") : t("paymentCard")}
                hint={
                  cardIsDemo
                    ? t("paymentCardDemoHint")
                    : t("paymentCardHint", { amount: formatEurPrice(totals.total) })
                }
              />
            ) : null}
          </div>
          {cardAvailable && (
            <CardBrandMarks className="mt-3" marks={cardMarks} label={tPayment("acceptedCards")} />
          )}
        </fieldset>

        {/* What affects the order, stated BEFORE it is placed. */}
        <section className="rounded-3xl border border-pizza-cream-dark bg-white p-6 text-sm text-pizza-muted shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("deliveryTermsTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("deliveryOnlyTowns", { towns: deliveryTownsLabel(locale) })}</li>
            <li>
              {DELIVERY_AREA.minimumOrderEur === null
                ? t("deliveryFreeNoMinimum")
                : t("deliveryFreeMinimum", { amount: formatEurPrice(DELIVERY_AREA.minimumOrderEur) })}
            </li>
            <li>{t("deliveryEta")}</li>
            <li>
              {t.rich("deliveryMore", {
                delivery: docLink("/delivery"),
                payment: docLink("/payment-methods"),
              })}
            </li>
          </ul>
        </section>

        <fieldset className="space-y-3 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <legend className="sr-only">{t("consentsTitle")}</legend>
          <h2 aria-hidden className="text-lg font-semibold text-pizza-ink">
            {t("consentsTitle")}
          </h2>
          <ConsentCheckbox
            name="consentTerms"
            checked={consents.consentTerms}
            onChange={(c) => setConsent("consentTerms", c)}
            error={errorFor("consentTerms")}
          >
            {t.rich("consentTerms", { terms: docLink("/terms") })}
          </ConsentCheckbox>
          <ConsentCheckbox
            name="consentRefunds"
            checked={consents.consentRefunds}
            onChange={(c) => setConsent("consentRefunds", c)}
            error={errorFor("consentRefunds")}
          >
            {t.rich("consentRefunds", { refunds: docLink("/refunds") })}
          </ConsentCheckbox>
          <ConsentCheckbox
            name="consentPrivacy"
            checked={consents.consentPrivacy}
            onChange={(c) => setConsent("consentPrivacy", c)}
            error={errorFor("consentPrivacy")}
          >
            {t.rich("consentPrivacy", { privacy: docLink("/privacy") })}
          </ConsentCheckbox>
        </fieldset>

        {/* `createOrder` refuses a closed shop on its own — this only spares
            the customer filling the whole form to be told no at the end. */}
        <StoreClosedBanner />

        <MinimumOrderNotice subtotalEur={totals.total} />

        {unavailableLines.length > 0 && (
          <p
            role="status"
            data-testid="checkout-unavailable"
            className="rounded-2xl border border-brand/30 bg-pizza-red-light px-4 py-3 text-sm font-medium text-brand-dark"
          >
            {tCart("unavailableAtCheckout", {
              names: unavailableLines.map((i) => cartProductName(i, locale)).join(", "),
            })}
          </p>
        )}

        {outdatedLines.length > 0 && (
          <p
            role="status"
            data-testid="checkout-outdated-lines"
            className="rounded-2xl border border-brand/30 bg-pizza-red-light px-4 py-3 text-sm font-medium text-brand-dark"
          >
            {tCart("blockedAtCheckout", {
              names: outdatedLines.map((i) => cartProductName(i, locale)).join(", "),
            })}{" "}
            <Link href="/cart" className="underline underline-offset-2">
              {tCart("title")}
            </Link>
          </p>
        )}

        {/* The final amount, immediately before the binding action. */}
        <div
          className="flex items-baseline justify-between gap-3 rounded-2xl bg-pizza-cream/60 px-5 py-4 text-pizza-ink"
          data-testid="checkout-final-total"
        >
          <span className="text-sm font-semibold">
            {t("finalTotal")}
            <span className="block text-xs font-normal text-pizza-muted">{t("finalTotalNote")}</span>
          </span>
          <span className="text-xl font-bold">{formatEurPrice(totals.total)}</span>
        </div>

        {/* data-testid: the ONE order button. A signed-in visitor also has a
            "Sign out" submit button in the header, earlier in the page — a
            generic "form button[type=submit]" picks that one (it signed the
            tester out and landed on the home page, with no order). */}
        <button
          type="submit"
          data-testid="place-order"
          disabled={
            isPending ||
            checkingPrevious ||
            !checkoutKey ||
            storeClosed ||
            belowMinimum ||
            unavailableLines.length > 0 ||
            outdatedLines.length > 0
          }
          className="w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark disabled:opacity-60"
        >
          {checkingPrevious
            ? t("checkingPrevious")
            : isPending
            ? t("placing")
            : paymentMethod === "card_online"
              ? cardIsDemo
                ? t("submitCardDemo")
                : t("submitCard")
              : t("submit")}
        </button>
        <p className="text-center text-xs text-pizza-muted">
          {paymentMethod === "card_online" ? t("submitCardNote") : t("submitCashNote")}
        </p>

      </form>

      {/* Order summary */}
      <aside className="h-fit rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-pizza-ink">{t("orderSummary")}</h2>
        <ul className="mb-4 space-y-2.5 text-sm">
          {items.map((i) => (
            <li key={i.lineId} className="text-pizza-muted">
              <div className="flex justify-between gap-2">
                <span className="min-w-0">
                  {i.quantity}× {cartProductName(i, locale)}
                  {cartVariantName(i, locale) ? ` (${cartVariantName(i, locale)})` : ""}
                </span>
                {/* Preview line total incl. extras — server recomputes it. */}
                <span className="shrink-0 text-right font-medium text-pizza-ink">
                  {formatEurPrice(linePreviewTotalEur(i))}
                  {i.quantity > 1 && (
                    <span className="block whitespace-nowrap text-xs font-normal text-pizza-muted">
                      {i.quantity} × {formatEurPrice(lineUnitPreviewEur(i))}
                    </span>
                  )}
                </span>
              </div>
              {(i.extras ?? []).length > 0 && (
                <ul className="mt-0.5 space-y-0.5 pl-4 text-xs">
                  {(i.extras ?? []).map((e) => (
                    <li key={e.key} className="break-words">
                      + {e.quantity > 1 ? `${e.quantity}× ` : ""}
                      {cartExtraName(e, locale)}
                      {e.display && (
                        <span className="whitespace-nowrap">
                          {" — "}
                          {e.display.unitPriceEur === 0
                            ? tCart("free")
                            : formatEurPrice(Math.round(e.display.unitPriceEur * e.quantity * 100) / 100)}
                        </span>
                      )}
                    </li>
                  ))}
                  {i.quantity > 1 && <li className="italic">{tCart("extrasPerItem")}</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <CartSummary totals={totals} />
      </aside>
    </div>
  );
}

/**
 * One explicit confirmation. A real, unticked-by-default checkbox with a
 * visible label (the whole row is clickable and keyboard-focusable), and the
 * refusal read out by screen readers when it is missing.
 */
function ConsentCheckbox({
  name,
  checked,
  onChange,
  error,
  children,
}: {
  name: ConsentField;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`flex items-start gap-3 rounded-2xl border-2 p-3 transition ${
          error
            ? "border-brand bg-red-50"
            : checked
              ? "border-pizza-green bg-pizza-green-light/30"
              : "border-pizza-cream-dark"
        }`}
      >
        <input
          id={name}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-pizza-green"
        />
        <label htmlFor={name} className="cursor-pointer text-sm leading-relaxed text-pizza-ink">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 pl-1 text-xs font-medium text-brand">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One payment method as a large, tappable radio card. A real radio input
 * carries the value (so the form works and screen readers announce the
 * group); the card around it is the label.
 */
function PaymentOption({
  value,
  checked,
  onSelect,
  icon,
  title,
  hint,
}: {
  value: PaymentChoice;
  checked: boolean;
  onSelect: (value: PaymentChoice) => void;
  icon: string;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition ${
        checked
          ? "border-pizza-green bg-pizza-green-light/40"
          : "border-pizza-cream-dark hover:border-pizza-green/50"
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="mt-1 h-4 w-4 accent-pizza-green"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-pizza-ink">
          <span aria-hidden>{icon}</span> {title}
        </span>
        <span className="mt-0.5 block text-sm text-pizza-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * The red notice that appears when an order is refused for missing details.
 *
 * It floats over the page rather than sitting in the form for one reason: the
 * customer may be anywhere on a long checkout page when they press the button,
 * and a message they have to scroll to find is a message they do not see. It
 * names every missing field, and it says outright that nothing was lost —
 * which used to be the actual worry, since the form emptied itself.
 *
 * Not a modal: the fields it is complaining about have to stay reachable. It
 * closes on ✕, and disappears by itself as soon as the last field is filled.
 */
function MissingFieldsPopup({
  title,
  kept,
  fields,
  closeLabel,
  goLabel,
  onClose,
  onGo,
}: {
  title: string;
  kept: string;
  fields: string[];
  closeLabel: string;
  goLabel: string;
  onClose: () => void;
  onGo: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-red-700 bg-red-600 px-5 py-4 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-bold">⚠ {title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2 text-lg leading-none text-white/80 transition hover:text-white"
          >
            ✕
          </button>
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm font-semibold">
          {fields.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="mt-2.5 text-xs text-white/90">{kept}</p>
        <button
          type="button"
          onClick={onGo}
          className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-red-700 transition hover:bg-red-50"
        >
          {goLabel}
        </button>
      </div>
    </div>
  );
}
