import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  categories: Category[];
  products: Product[];
}

/**
 * Groups products by category and renders a titled section per category with a
 * responsive grid. Each section has an id (`category-<slug>`) so the category
 * navigation can scroll to it. Empty categories are skipped.
 */
export function ProductGrid({ categories, products }: ProductGridProps) {
  return (
    <div className="space-y-16">
      {categories.map((category) => {
        const items = products
          .filter((p) => p.categoryId === category.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        if (items.length === 0) return null;

        return (
          <section
            key={category.id}
            id={`category-${category.slug}`}
            className="scroll-mt-44"
            aria-labelledby={`heading-${category.slug}`}
          >
            <div className="mb-6">
              <h2
                id={`heading-${category.slug}`}
                className="flex items-center gap-3 text-2xl font-bold text-pizza-ink sm:text-3xl"
              >
                {category.icon && (
                  <span className="text-2xl sm:text-3xl" aria-hidden>
                    {category.icon}
                  </span>
                )}
                {category.name}
              </h2>
              {category.description && (
                <p className="mt-2 max-w-2xl text-sm text-pizza-muted">
                  {category.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <span className="h-px w-12 bg-pizza-green/40" />
                <span className="text-xs text-pizza-green">◆</span>
                <span className="h-px flex-1 bg-pizza-cream-dark" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
