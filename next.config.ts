import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // The build type-checks the site only. scripts/ and tests/ are dev tools
    // (Playwright, tsx), not installed by Render's production install;
    // `npm run type-check` still checks them with the full tsconfig.json.
    tsconfigPath: "tsconfig.build.json",
  },
};

export default withNextIntl(nextConfig);
