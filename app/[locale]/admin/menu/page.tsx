import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * The old placeholder "menu management" page. The real thing lives at
 * /admin/products (DB-backed since 2026-07-18) — this route only survives for
 * bookmarks and is no longer in the sidebar.
 */
export default async function AdminMenuPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  redirect({ href: "/admin/products", locale });
}
