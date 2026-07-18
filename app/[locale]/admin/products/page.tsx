import type { Metadata } from "next";
import { use } from "react";
import { getProducts } from "@/lib/menu-data";
import { formatDualPrice } from "@/lib/format-price";
import type { Locale } from "@/i18n/routing";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = use(params);
  const products = getProducts(locale);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Продукти</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Име</th>
              <th className="px-4 py-2">Цена</th>
              <th className="px-4 py-2">Наличен</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-medium text-neutral-800">{p.name}</td>
                <td className="px-4 py-2">{formatDualPrice(p.priceEur, p.priceBgn)}</td>
                <td className="px-4 py-2">{p.isAvailable ? "Да" : "Не"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-pizza-muted">
        Продуктите се четат от менюто. Редакцията им ще се активира заедно с
        модула за управление на менюто.
      </p>
    </div>
  );
}
