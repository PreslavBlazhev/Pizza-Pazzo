"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormAlert } from "@/components/ui/FormAlert";
import { CartSummary } from "@/components/cart/CartSummary";
import { useCartStore, useCartHydrated } from "@/store/cart-store";
import { createOrder, type CheckoutResult } from "@/app/actions/checkout";

interface Props {
  /** Prefilled contact details for a signed-in user. */
  defaults?: { name?: string; email?: string; phone?: string };
}

export function CheckoutForm({ defaults }: Props) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const hydrated = useCartHydrated();
  const items = useCartStore((s) => s.items);
  const totalsFn = useCartStore((s) => s.totals);
  const clear = useCartStore((s) => s.clear);

  const [state, formAction, isPending] = useActionState<CheckoutResult | null, FormData>(
    createOrder,
    null
  );

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

  const fieldErrors = state?.fieldErrors ?? {};
  const totals = totalsFn();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form action={formAction} className="space-y-6" noValidate>
        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <input type="hidden" name="items" value={itemsPayload} />

        <section className="space-y-3 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("contactDetails")}</h2>
          <Input
            label={t("fullName")}
            name="customerName"
            defaultValue={defaults?.name ?? ""}
            autoComplete="name"
            error={fieldErrors.customerName}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={t("phone")}
              name="customerPhone"
              type="tel"
              defaultValue={defaults?.phone ?? ""}
              autoComplete="tel"
              error={fieldErrors.customerPhone}
            />
            <Input
              label={t("emailRequired")}
              name="customerEmail"
              type="email"
              required
              defaultValue={defaults?.email ?? ""}
              autoComplete="email"
              error={fieldErrors.customerEmail}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("deliveryDetails")}</h2>
          <Input
            label={t("city")}
            name="deliveryCity"
            defaultValue="Плевен"
            error={fieldErrors.deliveryCity}
          />
          <Textarea
            label={t("address")}
            name="deliveryAddress"
            placeholder={t("addressPlaceholder")}
            error={fieldErrors.deliveryAddress}
          />
          <Textarea
            label={t("notes")}
            name="deliveryNote"
            placeholder={t("notesPlaceholder")}
            error={fieldErrors.deliveryNote}
          />
        </section>

        <section className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-pizza-ink">{t("payment")}</h2>
          <p className="mt-2 text-sm text-pizza-muted">💵 {t("paymentCod")}</p>
        </section>

        <button
          type="submit"
          disabled={isPending}
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
        <ul className="mb-4 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.lineId} className="flex justify-between gap-2 text-pizza-muted">
              <span className="min-w-0 truncate">
                {i.quantity}× {i.product.name}
                {i.selectedVariant ? ` (${i.selectedVariant.name})` : ""}
              </span>
            </li>
          ))}
        </ul>
        <CartSummary totals={totals} />
      </aside>
    </div>
  );
}
