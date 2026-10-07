/**
 * PRODUCTION-CONFIGURATION guard for the payment simulator (UBB-07/UBB-14,
 * docs/UBB-VERIFICATION.md). Runs over HTTP against a LOCAL production build
 * started with APP_ENV=production — never against the real site:
 *
 *   npm run build
 *   APP_ENV=production APP_BASE_URL=https://pizzapazzo.bg RESEND_API_KEY= \
 *     CARD_PAYMENTS_ENABLED=false npx next start -p 3001
 *   E2E_BASE_URL=http://localhost:3001 npm run e2e:prod-guard
 *
 * With the stored demo switch set to EVERYONE (the most permissive value) it
 * proves: a guest's checkout offers no card option and no card logos; the
 * payment-methods page says card payment is not active; the simulator's
 * hosted page is 404 for a guest (so nobody public can "pay"), but opens for
 * signed-in staff. Restores the switch and deletes its session afterwards.
 */
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE } from "@/lib/auth/jwt";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("Refusing to run against a non-local server.");
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const settings = await db.restaurantSettings.findUniqueOrThrow({ where: { id: "restaurant" } });
  const staff = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", isActive: true } });
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub: staff.id, email: staff.email, role: "SUPER_ADMIN" })}`;
  const session = await db.paymentSimulatorSession.create({
    data: {
      reference: `GUARD-${Date.now()}`,
      amountMinor: 1000,
      currency: "EUR",
      returnUrl: `${BASE}/payment/return`,
    },
  });

  try {
    await db.restaurantSettings.update({ where: { id: "restaurant" }, data: { cardDemoMode: "EVERYONE" } });
    console.log(`Production guard against ${BASE} (stored demo switch: EVERYONE)\n`);

    // The form itself renders after the cart hydrates, so read what the
    // server handed it: the props in the page's RSC payload.
    const guestRes = await fetch(`${BASE}/checkout`);
    const guestCheckout = await guestRes.text();
    check(guestRes.status === 200, "guest checkout → 200");
    check(/\\?"cardAvailable\\?":false/.test(guestCheckout), "guest checkout: the server offers NO card option");
    // The footer carries the card-scheme logos ОББ asked for (UBB-14); the
    // checkout form's own marks ("pay with this card here") must stay off.
    check(/\\?"cardMarks\\?":\[\]/.test(guestCheckout), "guest checkout: no card logos at the payment choice");
    check(guestCheckout.includes("все още не е активно"), "checkout: card payment stated as NOT active");

    const staffCheckout = await (await fetch(`${BASE}/checkout`, { headers: { cookie } })).text();
    check(
      /\\?"cardAvailable\\?":true,\\?"cardIsDemo\\?":true/.test(staffCheckout),
      "signed-in staff: the demo card option (test orders only)"
    );

    const methods = await (await fetch(`${BASE}/payment-methods`)).text();
    check(methods.includes("все още не е активно"), "payment-methods: card payment stated as NOT active");

    const guestSim = await fetch(`${BASE}/payment-simulator/${session.id}`, { redirect: "manual" });
    check(guestSim.status === 404, "guest: simulator hosted page is 404", `got ${guestSim.status}`);
    const staffSim = await fetch(`${BASE}/payment-simulator/${session.id}`, { headers: { cookie }, redirect: "manual" });
    check(staffSim.status === 200, "staff: simulator hosted page opens", `got ${staffSim.status}`);

    const forged = await fetch(`${BASE}/api/payments/callback/simulator`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: session.reference, providerPaymentId: session.id }),
    });
    check(forged.status >= 400, "unsigned public callback is refused", `got ${forged.status}`);
    const after = await db.paymentSimulatorSession.findUniqueOrThrow({ where: { id: session.id } });
    check(after.state === "OPEN", "nothing public changed the simulator ledger");
  } finally {
    await db.restaurantSettings.update({ where: { id: "restaurant" }, data: { cardDemoMode: settings.cardDemoMode } });
    await db.paymentSimulatorSession.delete({ where: { id: session.id } });
    await db.$disconnect();
  }

  if (failures > 0) {
    console.error(`\nPRODUCTION GUARD FAILED (${failures})`);
    process.exit(1);
  }
  console.log("\nPRODUCTION GUARD OK");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
