import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Fingerprint of patches/*.patch (patch-package, applied on `npm install`).
 * Webpack's build cache treats node_modules as unchanged while a package's
 * version is unchanged — a patched file inside `next` would be IGNORED by a
 * build that reuses .next/cache. Folding the patches into the cache version
 * makes any change to them start a fresh compile.
 */
function patchesFingerprint(): string {
  const hash = createHash("sha256");
  try {
    for (const name of readdirSync("patches").sort()) {
      if (name.endsWith(".patch")) hash.update(name).update(readFileSync(join("patches", name)));
    }
  } catch {
    hash.update("no-patches");
  }
  return hash.digest("hex").slice(0, 16);
}

const PATCHES = patchesFingerprint();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    if (config.cache && typeof config.cache === "object") {
      config.cache.version = `${config.cache.version ?? ""}|patches:${PATCHES}`;
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
