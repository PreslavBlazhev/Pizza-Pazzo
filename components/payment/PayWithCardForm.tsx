"use client";

import { useState } from "react";

/**
 * The form behind "Плати с карта". A plain POST to /api/payments/start, so it
 * works without JavaScript and inside the Android app; the only script is the
 * guard that greys the button out after the first press. The server is what
 * actually prevents a second session (see startCardPayment) — this only
 * spares the customer a confusing second click.
 */
export function PayWithCardForm({
  token,
  locale,
  label,
  busyLabel,
  variant = "primary",
}: {
  token: string;
  locale: "bg" | "en";
  label: string;
  busyLabel: string;
  variant?: "primary" | "outline";
}) {
  const [submitting, setSubmitting] = useState(false);
  const styles =
    variant === "primary"
      ? "bg-brand text-white shadow-soft hover:bg-brand-dark"
      : "border-2 border-brand text-brand hover:bg-pizza-red-light";

  return (
    <form
      method="post"
      action="/api/payments/start"
      onSubmit={(e) => {
        if (submitting) {
          e.preventDefault();
          return;
        }
        setSubmitting(true);
      }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className={`w-full rounded-full px-6 py-3.5 font-semibold transition disabled:opacity-60 ${styles}`}
      >
        {submitting ? busyLabel : label}
      </button>
    </form>
  );
}
