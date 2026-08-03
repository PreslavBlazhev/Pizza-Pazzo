import { useTranslations } from "next-intl";
import type { Product } from "@/types/product";
import type { Category } from "@/types/category";
import type { ProductExtrasData } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";
import { isAllergenId, orderedAllergens } from "@/lib/allergens";
import { AddToCart } from "@/components/cart/AddToCart";
import { ProductImage } from "./ProductImage";

interface ProductDetailsProps {
  product: Product;
  category?: Category;
  /** Extras offer for the picker; null → no picker (drinks/desserts). */
  extras?: ProductExtrasData | null;
}

/** Full product view with purchase controls. */
export function ProductDetails({ product, category, extras = null }: ProductDetailsProps) {
  const t = useTranslations("product");
  const tAllergens = useTranslations("allergens");
  const allergens = orderedAllergens(product.allergens);

  return (
    <div className="grid gap-10 md:grid-cols-2">
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-pizza-cream-dark bg-white shadow-card">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
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
      </div>

      {/* Info */}
      <div className="flex flex-col">
        {category && (
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
            {category.icon} {category.name}
          </span>
        )}
        <h1 className="mt-2 text-3xl font-bold text-pizza-ink sm:text-4xl">
          {product.name}
        </h1>

        {product.description && (
          <p className="mt-4 leading-relaxed text-pizza-muted">
            {product.description}
          </p>
        )}

        {product.size && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-pizza-cream-dark px-3 py-1 text-sm font-medium text-pizza-ink">
            🍽️ {product.size}
          </p>
        )}

        {/* Price + availability */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-end gap-2">
            <span className="font-display text-3xl font-bold text-brand">
              {formatEurPrice(product.priceEur)}
            </span>

          </div>
          {product.isAvailable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pizza-green-light px-3 py-1 text-sm font-medium text-pizza-green-dark">
              ● {t("inStock")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pizza-red-light px-3 py-1 text-sm font-medium text-brand">
              ● {t("outOfStock")}
            </span>
          )}
        </div>

        {/* Ingredients */}
        {product.ingredients && product.ingredients.length > 0 && (
          <div className="mt-7">
            <p className="mb-2 text-sm font-semibold text-pizza-ink">
              {t("ingredients")}
            </p>
            <p className="text-sm leading-relaxed text-pizza-muted">
              {product.ingredients.join(", ")}
            </p>
          </div>
        )}

        {/* Allergens */}
        <div className="mt-7">
          <p className="mb-2 text-sm font-semibold text-pizza-ink">
            {t("allergens")}
          </p>
          {allergens.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allergens.map((id) => (
                <span
                  key={id}
                  title={isAllergenId(id) ? tAllergens(`${id}.description`) : undefined}
                  className="rounded-full bg-pizza-green-light px-3 py-1 text-xs font-medium text-pizza-green-dark"
                >
                  {isAllergenId(id) ? tAllergens(`${id}.name`) : id}
                </span>
              ))}
            </div>
          ) : (
            !product.allergensUnverified && (
              <p className="text-sm italic text-pizza-muted">
                {t("allergensNone")}
              </p>
            )
          )}
          {product.allergensUnverified && (
            <p className="mt-2 text-sm italic text-pizza-muted">
              {t("allergensUnknown")}
            </p>
          )}
        </div>

        {/* Add to cart (+ extras picker + back-to-menu link) */}
        <AddToCart product={product} extras={extras} />
      </div>
    </div>
  );
}
