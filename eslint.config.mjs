import { FlatCompat } from "@eslint/eslintrc";

/**
 * Flat ESLint config (ESLint 9). `next lint` is deprecated in Next 15, so the
 * `lint` script runs the ESLint CLI directly; FlatCompat translates the
 * Next.js shareable configs (core-web-vitals + TS rules) to flat format.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "_downloads-and-unused/**",
      "Pizza Pazzo/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
