import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Количка" };

export default function CartPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-neutral-800">Shopping Cart</h1>
        <p className="text-sm text-neutral-500">
          Placeholder — количката се изгражда в Stage 2. Тук ще се показват
          добавените продукти и обобщение на сумата.
        </p>
        <Link
          href="/checkout"
          className="mt-6 inline-block rounded-md bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
        >
          Към поръчката
        </Link>
      </main>
      <Footer />
    </>
  );
}
