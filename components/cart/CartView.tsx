"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCartStore, useCartHydrated } from "@/store/cart-store";
import { StoreClosedBanner } from "@/components/store/StoreClosedBanner";
import { useStoreClosed } from "@/components/store/StoreStatusProvider";
import { CartItem } from "./CartItem";
import { CartSummary } from "./CartSummary";

/** The interactive cart. Rendered inside the server cart page shell. */
export function CartView() {
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const hydrated = useCartHydrated();
  const items = useCartStore((s) => s.items);
  const totalsFn = useCartStore((s) => s.totals);
  const clear = useCartStore((s) => s.clear);
  const storeClosed = useStoreClosed();

  // Until the persisted cart is read, render a stable placeholder so the server
  // and first client paint match.
  if (!hydrated) {
    return <div className="mx-auto h-40 w-full max-w-2xl animate-pulse rounded-3xl bg-pizza-cream-dark/40" />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-5xl">🛒</div>
        <p className="mt-6 text-lg text-pizza-muted">{t("empty")}</p>
        <Link
          href="/menu"
          className="mt-8 inline-block rounded-full bg-pizza-green px-8 py-3.5 font-semibold text-white transition hover:bg-pizza-green-dark"
        >
          {tCommon("browseMenu")}
        </Link>
      </div>
    );
  }

  const totals = totalsFn();

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1fr_20rem]">
      {/* Lines */}
      <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
        {items.map((item) => (
          <CartItem key={item.lineId} item={item} />
        ))}
        <button
          type="button"
          onClick={clear}
          className="mt-4 text-xs font-medium text-pizza-muted underline-offset-2 transition hover:text-brand hover:underline"
        >
          {t("clear")}
        </button>
      </div>

      {/* Summary */}
      <aside className="h-fit rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
        <CartSummary totals={totals} />

        <StoreClosedBanner className="mt-6" />

        {/* Closed: the cart is kept (nothing is thrown away) but the way
            forward is a dead button rather than a link into a checkout that
            would only be refused on submit. */}
        {storeClosed ? (
          <span
            aria-disabled
            className="mt-6 block cursor-not-allowed rounded-full bg-pizza-cream-dark px-6 py-3.5 text-center font-semibold text-pizza-muted"
          >
            {t("checkout")}
          </span>
        ) : (
          <Link
            href="/checkout"
            className="mt-6 block rounded-full bg-brand px-6 py-3.5 text-center font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            {t("checkout")}
          </Link>
        )}
        <Link
          href="/menu"
          className="mt-3 block text-center text-sm font-medium text-pizza-green transition hover:underline"
        >
          {t("continueShopping")}
        </Link>
      </aside>
    </div>
  );
}
