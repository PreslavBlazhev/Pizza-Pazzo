import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { getSimulatorConfig } from "@/lib/payments/providers";
import { simulatorPageAllowed } from "@/lib/payments/demo";
import { getSessionUser } from "@/lib/auth";
import {
  mapSimulatorState,
  SIMULATOR_SCENARIOS,
  type SimulatorScenario,
} from "@/lib/payments/providers/simulator";
import { formatMinor } from "@/lib/payments/money";
import { simulatorDecideAction } from "@/app/actions/payment-simulator";
import { SimulatorCheckout } from "@/components/payment/SimulatorCheckout";
import type { Locale } from "@/i18n/routing";

/**
 * The SIMULATOR's "hosted payment page" — a demo card form (test numbers
 * only, checked in the browser) plus the advanced scenario buttons.
 *
 * It plays the bank: whatever is chosen here only changes the simulator's own
 * ledger. The order is settled afterwards by the site's normal server-to-
 * server verification (callback + status query), exactly as with a bank.
 *
 * 404 unless the simulator is the configured and allowed provider, so this
 * page cannot exist on a production deployment.
 */
export const metadata: Metadata = {
  title: "Тестов платежен симулатор",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: Locale; id: string }>;
}

/** Card-driven outcomes are on the form; these stay as buttons. */
const ADVANCED: SimulatorScenario[] = [
  "pending",
  "latePaid",
  "lateAfterDecline",
  "unreachable",
  "duplicateCallback",
  "amountMismatch",
  "declined",
  "cancelled",
];

export default async function PaymentSimulatorPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!(await getSimulatorConfig())) notFound();
  // Production: the demo "bank page" exists only for signed-in staff.
  const viewer = await getSessionUser();
  if (!simulatorPageAllowed(viewer?.role ?? null)) notFound();

  const session = await db.paymentSimulatorSession.findUnique({ where: { id } });
  if (!session) notFound();

  const attempt = await db.paymentAttempt.findUnique({
    where: { reference: session.reference },
    select: { order: { select: { orderNumber: true } } },
  });

  const open =
    session.state === "OPEN" && mapSimulatorState(session.state, session.createdAt) !== "EXPIRED";

  if (!open) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow ring-1 ring-slate-200">
          <p className="font-semibold">
            {locale === "en"
              ? "This test payment session has already finished."
              : "Тази тестова платежна сесия вече е приключила."}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">{session.state}</p>
          <a href={session.returnUrl} className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white">
            {locale === "en" ? "Back to Pizza Pazzo" : "Обратно към Pizza Pazzo"}
          </a>
        </div>
      </main>
    );
  }

  return (
    <SimulatorCheckout
      sessionId={session.id}
      locale={locale === "en" ? "en" : "bg"}
      amountLabel={formatMinor(session.amountMinor, session.currency)}
      orderNumber={attempt?.order.orderNumber ?? null}
      reference={session.reference}
      decide={simulatorDecideAction}
      advancedScenarios={ADVANCED.map((key) => ({ key, label: SIMULATOR_SCENARIOS[key].bg }))}
    />
  );
}
