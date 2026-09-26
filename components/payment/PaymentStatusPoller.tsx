"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Asks the server "is it paid yet?" and moves to the matching result page.
 *
 * Used on the "checking" screen (straight after the bank) and on the
 * "waiting for confirmation" screen. The answer comes from
 * /api/payments/status, which asks the provider server-to-server — the
 * browser never decides anything itself.
 *
 * Polling backs off (2 s → 10 s) and stops after ~10 minutes; the manual
 * "check again" button keeps working after that.
 */
type State = "PAID" | "PENDING" | "FAILED" | "NOT_STARTED" | "ORDER_CANCELLED" | "NOT_CARD" | "NOT_FOUND";

const MAX_POLLS = 80;

export function PaymentStatusPoller({
  token,
  stayOn,
  checkLabel,
  checkingLabel,
}: {
  token: string;
  /** Do not navigate while the state is this one (the page already shows it). */
  stayOn?: State;
  checkLabel?: string;
  checkingLabel: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (state: State) => {
      const query = { t: token };
      if (state === stayOn) return false;
      if (state === "PAID") router.replace({ pathname: "/payment/success", query });
      else if (state === "FAILED") router.replace({ pathname: "/payment/failed", query });
      else if (state === "PENDING") router.replace({ pathname: "/payment/pending", query });
      else if (state === "NOT_STARTED" || state === "ORDER_CANCELLED")
        router.replace(`/checkout/pay/${token}`);
      else if (state === "NOT_FOUND" || state === "NOT_CARD") router.replace("/");
      else return false;
      return true;
    },
    [router, stayOn, token]
  );

  const check = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const res = await fetch(`/api/payments/status?t=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { state?: State };
      return data.state ? go(data.state) : false;
    } catch {
      return false; // offline for a moment — the next poll tries again
    } finally {
      setChecking(false);
    }
  }, [go, token]);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      const moved = await check();
      polls.current += 1;
      if (moved || cancelled || polls.current >= MAX_POLLS) return;
      const delay = Math.min(2000 + polls.current * 500, 10_000);
      timer.current = setTimeout(loop, delay);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check]);

  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <div
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-4 border-pizza-cream-dark border-t-pizza-green"
      />
      {checkLabel ? (
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="rounded-full border border-pizza-cream-dark px-5 py-2 text-sm font-medium text-pizza-ink transition hover:border-pizza-green disabled:opacity-60"
        >
          {checking ? checkingLabel : checkLabel}
        </button>
      ) : (
        <p className="text-sm text-pizza-muted">{checkingLabel}</p>
      )}
    </div>
  );
}
