import type { Metadata } from "next";
import { getCategories } from "@/lib/menu-data";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  const categories = getCategories();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Категории</h1>
      <ul className="space-y-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2 text-sm"
          >
            <span className="font-medium text-neutral-800">{c.name}</span>
            <span className="text-neutral-400">/{c.slug}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-pizza-muted">
        Категориите се четат от менюто. Редакцията им ще се активира заедно с
        модула за управление на менюто.
      </p>
    </div>
  );
}
