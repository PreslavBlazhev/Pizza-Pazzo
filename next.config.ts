import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Category photos are posted with the category form (Admin → Категории):
      // up to 8 MB per photo (lib/uploads/validate.ts) + the text fields. Keep
      // this under the proxy's 10 MB request-body buffer.
      bodySizeLimit: "9mb",
    },
  },
  typescript: {
    // The build type-checks the site only. scripts/ and tests/ are dev tools
    // (Playwright, tsx), not installed by Render's production install;
    // `npm run type-check` still checks them with the full tsconfig.json.
    tsconfigPath: "tsconfig.build.json",
  },
};

export default withNextIntl(nextConfig);
