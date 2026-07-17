import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata: Metadata = { title: "Поръчка" };

export default function CheckoutPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-neutral-800">Checkout</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Финализиране на поръчката (placeholder — Stage 4).
        </p>
        <CheckoutForm />
      </main>
      <Footer />
    </>
  );
}
