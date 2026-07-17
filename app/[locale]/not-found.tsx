import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function NotFound() {
  const t = useTranslations("errors.notFound");

  return (
    <>
      <Header />
      <main className="container flex flex-col items-center py-24 text-center sm:py-32">
        <div className="text-6xl">🍕</div>
        <h1 className="mt-6 text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-pizza-muted">{t("subtitle")}</p>
        <Link
          href="/menu"
          className="mt-8 rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          {t("toMenu")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
