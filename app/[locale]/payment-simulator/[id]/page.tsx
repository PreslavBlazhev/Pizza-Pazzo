import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import {
  mapSimulatorState,
  SIMULATOR_SCENARIOS,
  type SimulatorScenario,
} from "@/lib/payments/providers/simulator";
import { formatMinor } from "@/lib/payments/money";
import { simulatorDecideAction } from "@/app/actions/payment-simulator";
import type { Locale } from "@/i18n/routing";

/**
 * The SIMULATOR's "hosted payment page". Deliberately does not look like
 * Pizza Pazzo and does not look like a bank: it is a test instrument, and it
 * says so. There is no card field of any kind.
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

export default async function PaymentSimulatorPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const config = getEffectivePaymentConfig({ ...process.env, CARD_PAYMENTS_ENABLED: "true" });
  if (config.providerId !== "simulator" || !config.enabled) notFound();

  const session = await db.paymentSimulatorSession.findUnique({ where: { id } });
  if (!session) notFound();

  const open =
    session.state === "OPEN" && mapSimulatorState(session.state, session.createdAt) !== "EXPIRED";

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-2xl border-4 border-yellow-400 bg-yellow-300 p-4 text-slate-900">
          <p className="text-lg font-extrabold">ТЕСТОВ ПЛАТЕЖЕН СИМУЛАТОР</p>
          <p className="mt-1 text-sm font-semibold">
            Това НЕ е банка. Няма реални пари и няма поле за карта. Изберете какво да
            „отговори банката“ — поръчката ще бъде проверена от сайта по същия път, по който
            ще се проверява истинско плащане. / TEST PAYMENT SIMULATOR — no bank, no money.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-800 p-5">
          <p className="text-sm text-slate-400">{session.description}</p>
          <p className="mt-2 text-3xl font-bold">{formatMinor(session.amountMinor, session.currency)}</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{session.reference}</p>
        </div>

        {open ? (
          <form action={simulatorDecideAction} className="grid gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            {(Object.keys(SIMULATOR_SCENARIOS) as SimulatorScenario[]).map((key) => (
              <button
                key={key}
                type="submit"
                name="scenario"
                value={key}
                className={`rounded-xl px-4 py-3 text-left font-semibold transition ${
                  key === "paid"
                    ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                    : key === "declined" || key === "cancelled"
                      ? "bg-rose-500 text-white hover:bg-rose-400"
                      : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {SIMULATOR_SCENARIOS[key].bg}
                <span className="block font-mono text-xs font-normal opacity-70">{key}</span>
              </button>
            ))}
          </form>
        ) : (
          <p className="rounded-2xl bg-slate-800 p-5 text-sm">
            Тази тестова сесия вече е приключила ({session.state}). Върнете се в магазина.
          </p>
        )}
      </div>
    </main>
  );
}
