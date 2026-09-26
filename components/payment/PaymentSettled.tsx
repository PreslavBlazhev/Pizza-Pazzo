"use client";

import { useEffect } from "react";
import { useCartStore } from "@/store/cart-store";
import { clearPendingPayment } from "@/components/checkout/pending-payment";

/**
 * Runs once on the "paid" page: the order is paid and on its way to the
 * kitchen, so the cart it came from is emptied and the "waiting for payment"
 * reminder is forgotten. Rendered ONLY after the server confirmed the payment
 * — never on the strength of the URL alone.
 */
export function PaymentSettled({ token }: { token: string }) {
  const clear = useCartStore((s) => s.clear);
  useEffect(() => {
    clear();
    clearPendingPayment(token);
  }, [clear, token]);
  return null;
}

/** Forgets the reminder when the customer walks away from a failed payment. */
export function ForgetPendingPaymentLink({
  token,
  href,
  children,
  className,
}: {
  token: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className} onClick={() => clearPendingPayment(token)}>
      {children}
    </a>
  );
}
