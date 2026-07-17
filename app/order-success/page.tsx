import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Успешна поръчка" };

export default function OrderSuccessPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-5xl">🍕</div>
        <h1 className="mt-4 text-2xl font-bold text-neutral-800">
          Благодарим за поръчката!
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Placeholder страница за потвърждение (Stage 4). Ще получите известие,
          когато ресторантът приеме поръчката.
        </p>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-md bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
        >
          Обратно към менюто
        </Link>
      </main>
      <Footer />
    </>
  );
}
