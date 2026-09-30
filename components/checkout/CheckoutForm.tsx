"use client";

import {
  startTransition,
  useActionState,
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
import {
  linePreviewTotalEur,
  useCartHydrated,
  useCartStore,
} from "@/store/cart-store";
import { formatEurPrice } from "@/lib/format-price";
import { deliveryTownsLabel, DELIVERY_AREA } from "@/lib/delivery-area";
import { CONSENT_FIELDS, type ConsentField } from "@/lib/validators/checkout";
import { CardBrandMarks } from "@/components/payment/CardBrandMarks";
import type { CardBrandMark } from "@/lib/payments/card-marks";
import { createOrder, type CheckoutResult } from "@/app/actions/checkout";
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

/** The one town we deliver to — shown, not typed (lib/delivery-area.ts). */
const DELIVERY_TOWN = DELIVERY_AREA.towns[0].bg;

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

  const [state, formAction, isPending] = useActionState<CheckoutResult | null, FormData>(
    createOrder,
    null
  );

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
    setCheckoutKey(newCheckoutKey());
  }, []);

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
    const empty = REQUIRED_FIELDS.filter((field) =>
      (CONSENT_FIELDS as readonly string[]).includes(field)
        ? !consents[field as ConsentField]
        : values[field as TextField].trim() === ""
    );
    if (empty.length === 0) {
      setMissing([]);
      const data = new FormData(event.currentTarget);
      startTransition(() => formAction(data));
      return;
    }
    setMissing(empty);
    revealField(empty[0]);
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
    setCheckoutKey(newCheckoutKey());
    if (state.paymentMethod === "CARD_ONLINE" && state.accessToken) {
      rememberPendingPayment({ token: state.accessToken, orderNumber: state.orderNumber });
      router.push(`/checkout/pay/${state.accessToken}`);
      return;
    }
    clear();
    // A cash order replaces any card payment the customer walked away from.
    clearPendingPayment();
    router.push({ pathname: "/order-success", query: { n: String(state.orderNumber) } });
  }, [state, clear, router]);

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
            value={DELIVERY_TOWN}
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
            <li>{t("deliveryFreeNoMinimum")}</li>
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

        <button
          type="submit"
          disabled={isPending || storeClosed}
          className="w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark disabled:opacity-60"
        >
          {isPending
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
                  {i.quantity}× {i.product.name}
                  {i.selectedVariant ? ` (${i.selectedVariant.name})` : ""}
                </span>
                {/* Preview line total incl. extras — server recomputes it. */}
                <span className="shrink-0 font-medium text-pizza-ink">
                  {formatEurPrice(linePreviewTotalEur(i))}
                </span>
              </div>
              {(i.extras ?? []).length > 0 && (
                <ul className="mt-0.5 space-y-0.5 pl-4 text-xs">
                  {(i.extras ?? []).map((e) => (
                    <li key={e.key} className="break-words">
                      + {e.quantity > 1 ? `${e.quantity}× ` : ""}
                      {e.display
                        ? locale === "en"
                          ? e.display.nameEn
                          : e.display.nameBg
                        : e.key}
                    </li>
                  ))}
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
