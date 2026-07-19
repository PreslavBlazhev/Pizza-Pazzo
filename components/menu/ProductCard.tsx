import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types/product";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { isAllergenId, orderedAllergens } from "@/lib/allergens";
import { cn } from "@/lib/utils";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("product");
  const tAllergens = useTranslations("allergens");
  const allergens = orderedAllergens(product.allergens);
  const unavailable = !product.isAvailable;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-3xl border border-pizza-cream-dark bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-soft",
        unavailable && "opacity-70"
      )}
    >
      {/* Image + badges */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className={cn(
            "transition duration-500 group-hover:scale-105",
            unavailable && "grayscale"
          )}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
          {product.isPopular && (
            <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm">
              ★ {t("popular")}
            </span>
          )}
          {product.isNew && (
            <span className="rounded-full bg-pizza-green px-3 py-1 text-xs font-semibold text-white shadow-sm">
              {t("new")}
            </span>
          )}
        </div>
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/55">
            <span className="rounded-full bg-pizza-ink/85 px-4 py-1.5 text-xs font-semibold text-white">
              {t("outOfStock")}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-semibold text-pizza-ink">
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-pizza-muted">
            {product.description}
          </p>
        )}
        {product.size && (
          <p className="mt-1 text-xs font-medium text-pizza-green-dark">
            {product.size}
          </p>
        )}

        {/* Allergens */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {allergens.map((id) => (
            <span
              key={id}
              className="rounded-full bg-pizza-green-light px-2.5 py-0.5 text-[11px] font-medium text-pizza-green-dark"
            >
              {isAllergenId(id) ? tAllergens(`${id}.name`) : id}
            </span>
          ))}
          {allergens.length === 0 && !product.allergensUnverified && (
            <span className="text-[11px] italic text-pizza-muted">
              {t("allergensNone")}
            </span>
          )}
          {product.allergensUnverified && (
            <span className="text-[11px] italic text-pizza-muted">
              {t("allergensUnknown")}
            </span>
          )}
        </div>

        {/* Price + CTA */}
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-pizza-cream-dark pt-4">
          <div className="leading-none">
            {product.variants && product.variants.length > 0 && (
              <span className="mb-1 block text-[11px] text-pizza-muted">
                {t("from")}
              </span>
            )}
            <span className="font-display text-xl font-bold text-brand">
              {formatEurPrice(product.priceEur)}
            </span>
            <span className="ml-1.5 text-sm text-pizza-muted">
              {formatBgnPrice(product.priceBgn)}
            </span>
          </div>
          <Link
            href={`/product/${product.slug}`}
            className="shrink-0 rounded-full bg-pizza-green px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pizza-green-dark focus:outline-none focus:ring-2 focus:ring-pizza-green/40 focus:ring-offset-2"
            aria-label={t("viewDetailsFor", { name: product.name })}
          >
            {t("details")}
          </Link>
        </div>
      </div>
    </article>
  );
}
