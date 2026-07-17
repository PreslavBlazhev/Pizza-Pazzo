"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Category } from "@/types/category";
import { cn } from "@/lib/utils";

interface CategoryTabsProps {
  categories: Category[];
}

/**
 * Sticky category navigation. Horizontally scrollable on mobile.
 * Click smooth-scrolls to the matching category section; the active tab is
 * highlighted (green) via a scroll spy (IntersectionObserver).
 */
export function CategoryTabs({ categories }: CategoryTabsProps) {
  const t = useTranslations("menu");
  const [activeSlug, setActiveSlug] = useState<string>(categories[0]?.slug ?? "");

  useEffect(() => {
    const sections = categories
      .map((c) => document.getElementById(`category-${c.slug}`))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActiveSlug(visible.target.id.replace("category-", ""));
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  const handleClick = (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    setActiveSlug(slug);
    document
      .getElementById(`category-${slug}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label={t("categoryNav")}
      className="sticky top-20 z-30 -mx-4 border-b border-pizza-cream-dark bg-pizza-cream/90 px-4 py-3 backdrop-blur-md"
    >
      <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const active = category.slug === activeSlug;
          return (
            <li key={category.id} className="shrink-0">
              <a
                href={`#category-${category.slug}`}
                onClick={(e) => handleClick(e, category.slug)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition",
                  active
                    ? "border-pizza-green bg-pizza-green text-white shadow-sm"
                    : "border-pizza-cream-dark bg-white text-pizza-ink/80 hover:border-pizza-green/40 hover:bg-pizza-green-light hover:text-pizza-green-dark"
                )}
              >
                {category.icon && <span aria-hidden>{category.icon}</span>}
                {category.name}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
