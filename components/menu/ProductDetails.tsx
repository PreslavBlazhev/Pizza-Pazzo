import type { Product } from "@/types/product";
import type { Category } from "@/types/category";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { formatAllergens } from "@/lib/allergens";
import { ProductImage } from "./ProductImage";

interface ProductDetailsProps {
  product: Product;
  category?: Category;
}

/** Full product view. Add-to-cart controls arrive in Stage 2 (Количка). */
export function ProductDetails({ product, category }: ProductDetailsProps) {
  const allergens = formatAllergens(product.allergens);

  return (
    <div className="grid gap-10 md:grid-cols-2">
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-pizza-cream-dark bg-white shadow-card">
        <ProductImage src={product.imageUrl} alt={product.name} />
        <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
          {product.isPopular && (
            <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm">
              ★ Популярно
            </span>
          )}
          {product.isNew && (
            <span className="rounded-full bg-pizza-green px-3 py-1 text-xs font-semibold text-white shadow-sm">
              Ново
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
              {formatBgnPrice(product.priceBgn)}
            </span>
            <span className="pb-1 text-pizza-muted">
              {formatEurPrice(product.priceEur)}
            </span>
          </div>
          {product.isAvailable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pizza-green-light px-3 py-1 text-sm font-medium text-pizza-green-dark">
              ● В наличност
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pizza-red-light px-3 py-1 text-sm font-medium text-brand">
              ● Няма наличност
            </span>
          )}
        </div>

        {/* Variants */}
        {product.variants && product.variants.length > 0 && (
          <div className="mt-7">
            <p className="mb-3 text-sm font-semibold text-pizza-ink">Размери</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <div
                  key={v.id}
                  className="rounded-2xl border border-pizza-cream-dark bg-white px-4 py-2.5 text-sm shadow-sm"
                >
                  <span className="font-medium text-pizza-ink">{v.name}</span>
                  <span className="ml-2 font-semibold text-brand">
                    {formatBgnPrice(v.priceBgn)}
                  </span>
                  <span className="ml-1 text-pizza-muted">
                    {formatEurPrice(v.priceEur)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-pizza-muted">
              Изборът на размер и добавяне в количката идват в следващ етап.
            </p>
          </div>
        )}

        {/* Ingredients */}
        {product.ingredients && product.ingredients.length > 0 && (
          <div className="mt-7">
            <p className="mb-2 text-sm font-semibold text-pizza-ink">Съставки</p>
            <p className="text-sm leading-relaxed text-pizza-muted">
              {product.ingredients.join(", ")}
            </p>
          </div>
        )}

        {/* Allergens */}
        <div className="mt-7">
          <p className="mb-2 text-sm font-semibold text-pizza-ink">Алергени</p>
          {allergens.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allergens.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-pizza-green-light px-3 py-1 text-xs font-medium text-pizza-green-dark"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-pizza-muted">Без посочени алергени</p>
          )}
        </div>

        {/* Cart placeholder */}
        <div className="mt-9">
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-full bg-pizza-cream-dark px-6 py-3.5 text-sm font-semibold text-pizza-muted sm:w-auto sm:px-10"
          >
            🛒 Добавяне в количка — скоро
          </button>
        </div>
      </div>
    </div>
  );
}
