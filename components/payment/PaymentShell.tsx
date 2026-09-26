import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * Page frame shared by the payment screens: the site's header and footer,
 * one centred card, and an optional TEST ribbon that nobody can miss.
 */
export function PaymentShell({
  children,
  testNotice,
}: {
  children: React.ReactNode;
  /** Shown for simulator / sandbox payments. */
  testNotice?: string | null;
}) {
  return (
    <>
      <Header />
      <main className="container max-w-2xl py-10 sm:py-14">
        {testNotice && (
          <p
            role="note"
            className="mb-5 rounded-2xl border-2 border-fuchsia-500 bg-fuchsia-50 px-4 py-3 text-sm font-bold text-fuchsia-900"
          >
            {testNotice}
          </p>
        )}
        <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card sm:p-8">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Big status icon + title + subtitle at the top of a result page. */
export function PaymentHeading({
  icon,
  title,
  subtitle,
  tone = "neutral",
}: {
  icon: string;
  title: string;
  subtitle?: string;
  tone?: "success" | "error" | "neutral";
}) {
  const ring =
    tone === "success"
      ? "bg-pizza-green-light"
      : tone === "error"
        ? "bg-pizza-red-light"
        : "bg-pizza-cream";
  return (
    <div className="text-center">
      <div
        aria-hidden
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${ring}`}
      >
        {icon}
      </div>
      <h1 className="mt-4 font-display text-2xl font-bold text-pizza-ink sm:text-3xl">{title}</h1>
      {subtitle && <p className="mx-auto mt-2 max-w-md leading-relaxed text-pizza-muted">{subtitle}</p>}
    </div>
  );
}
