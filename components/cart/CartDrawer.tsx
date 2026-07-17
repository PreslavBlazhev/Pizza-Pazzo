"use client";

/**
 * Slide-in cart drawer (placeholder).
 * Will read from the cart store and render CartItem/CartSummary in Stage 2.
 */
export function CartDrawer({ open }: { open?: boolean }) {
  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-80 border-l border-neutral-200 bg-white p-4 shadow-xl">
      <p className="font-semibold text-neutral-800">Количка</p>
      <p className="mt-2 text-sm text-neutral-500">Placeholder — Stage 2.</p>
    </div>
  );
}
