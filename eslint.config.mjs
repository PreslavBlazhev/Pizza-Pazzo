import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "_downloads-and-unused/**",
      "Pizza Pazzo/**",
      "android-app/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    // Existing effects restore browser-only state after SSR or subscribe to
    // external services. Keep their tested hydration behaviour while exposing
    // the new React performance advice; all other rules remain errors.
    files: [
      "components/admin/AndroidPrinterSettingsButton.tsx",
      "components/admin/PrintOrderButton.tsx",
      "components/admin/ShiftProvider.tsx",
      "components/cart/AddToCart.tsx",
      "components/cart/useUnavailableProducts.ts",
      "components/checkout/CheckoutForm.tsx",
      "components/payment/PendingPaymentNotice.tsx",
      "components/profile/ProfileEditForm.tsx",
      "components/store/StoreStatusProvider.tsx",
      "store/cart-store.ts",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
];

export default config;
