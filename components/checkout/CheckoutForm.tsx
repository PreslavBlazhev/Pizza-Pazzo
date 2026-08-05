"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createOrder, type CheckoutResult } from "@/app/actions/checkout";

interface Props {
  /** Prefilled contact details for a signed-in user. */
  defaults?: { name?: string; email?: string; phone?: string };
}

/**
 * Every field the customer MUST fill, in the order they appear on the page.
 * The order matters: it decides which field the page scrolls to when several
 * are missing, and the order the popup lists them in.
 *
 * The delivery note is deliberately absent — it is the one optional field.
 */
const REQUIRED_FIELDS = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "deliveryCity",
  "deliveryAddress",
] as const;

type RequiredField = (typeof REQUIRED_FIELDS)[number];
type FormValues = Record<RequiredField | "deliveryNote", string>;

export function CheckoutForm({ defaults }: Props) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
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
    deliveryCity: "Плевен",
    deliveryAddress: "",
    deliveryNote: "",
  });

  /** Fields this browser found empty on the last attempt to submit. */
  const [missing, setMissing] = useState<RequiredField[]>([]);
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
    deliveryCity: t("city"),
    deliveryAddress: t("address"),
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
    const empty = REQUIRED_FIELDS.filter((field) => values[field].trim() === "");
    if (empty.length === 0) {
      setMissing([]);
      return; // let the action run
    }
    event.preventDefault();
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

  // On success: clear the cart and go to the confirmation page.
  useEffect(() => {
    if (state?.ok && state.orderNumber) {
      clear();
      router.push({ pathname: "/order-success", query: { n: String(state.orderNumber) } });
    }
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
  const errorFor = (field: keyof FormValues) =>
    missing.includes(field as RequiredField)
      ? t("fieldRequired")
      : serverErrors[field];

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
        action={formAction}
        onSubmit={handleSubmit}
        className="space-y-6"
        noValidate
      >
        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <input type="hidden" name="items" value={itemsPayload} />

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
            placeholder={requiredMark}
            value={values.deliveryCity}
            onChange={(e) => setValue("deliveryCity", e.target.value)}
            error={errorFor("deliveryCity")}
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

        <section className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("payment")}</h2>
          <p className="mt-2 text-sm text-pizza-muted">💵 {t("paymentCod")}</p>
        </section>

        {/* `createOrder` refuses a closed shop on its own — this only spares
            the customer filling the whole form to be told no at the end. */}
        <StoreClosedBanner />

        <button
          type="submit"
          disabled={isPending || storeClosed}
          className="w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark disabled:opacity-60"
        >
          {isPending ? t("placing") : t("submit")}
        </button>

        <p className="text-center text-xs text-pizza-muted">
          {t.rich("agreeTerms", {
            terms: (chunks) => (
              <Link
                href="/terms"
                target="_blank"
                className="underline transition hover:text-brand"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/privacy"
                target="_blank"
                className="underline transition hover:text-brand"
              >
                {chunks}
              </Link>
            ),
          })}
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
