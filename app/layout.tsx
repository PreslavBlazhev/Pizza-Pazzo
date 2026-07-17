import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/constants";

const display = Lora({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — Автентична италианска пица`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-pizza-cream font-sans text-pizza-ink antialiased">
        {children}
      </body>
    </html>
  );
}
