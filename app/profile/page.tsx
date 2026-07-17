import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";
import { AddressSection } from "@/components/profile/AddressSection";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { UserRoleBadge } from "@/components/admin/UserRoleBadge";
import { getUserAddresses, requireUser } from "@/lib/auth";
import { canAccessAdmin } from "@/types/auth";

export const metadata: Metadata = {
  title: "Моят профил",
  robots: { index: false, follow: false },
};

// Session-dependent: must never be prerendered. See app/admin/layout.tsx.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Middleware already gates /profile; this guard covers direct rendering and
  // gives us the typed session user.
  const sessionUser = await requireUser("/profile");
  const addresses = await getUserAddresses();

  const firstName = sessionUser.profile?.fullName?.split(" ")[0];

  return (
    <>
      <Header />
      <main className="container max-w-4xl py-12 sm:py-16">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
              Здравейте{firstName ? `, ${firstName}` : ""}!
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm text-pizza-muted">{sessionUser.email}</p>
              {/* Customers do not need to be told they are customers. */}
              {sessionUser.role !== "customer" && <UserRoleBadge role={sessionUser.role} />}
            </div>
          </div>
          <LogoutButton />
        </div>

        {/* Staff shortcut */}
        {canAccessAdmin(sessionUser.role) && (
          <Link
            href="/admin"
            className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-pizza-green/30 bg-pizza-green-light px-5 py-4 transition hover:border-pizza-green"
          >
            <span className="font-semibold text-pizza-green-dark">
              🛠 Имате достъп до админ панела
            </span>
            <span className="text-sm font-semibold text-pizza-green-dark">
              Отвори →
            </span>
          </Link>
        )}

        <div className="mt-8 space-y-6">
          <ProfileEditForm profile={sessionUser.profile} email={sessionUser.email} />

          <AddressSection addresses={addresses} />

          {/* Orders */}
          <Link
            href="/profile/orders"
            className="flex items-center justify-between gap-4 rounded-3xl border border-pizza-cream-dark bg-white px-6 py-5 shadow-card transition hover:border-pizza-green/40 hover:shadow-soft"
          >
            <div>
              <p className="font-display text-lg font-semibold text-pizza-ink">
                Моите поръчки
              </p>
              <p className="mt-0.5 text-sm text-pizza-muted">
                История на всички ваши поръчки.
              </p>
            </div>
            <span className="text-sm font-semibold text-pizza-green">Виж →</span>
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
