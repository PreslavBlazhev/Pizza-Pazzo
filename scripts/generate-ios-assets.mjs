/**
 * Generates the iOS app icon and launch-screen logo from the restaurant's own
 * logo, `public/logos/pizza-pazzo-logo.png` (the same source as the Android
 * icons, see generate-android-icons.mjs).
 *
 *   node scripts/generate-ios-assets.mjs
 *
 * Writes into ios-app/PizzaPazzo/Assets.xcassets:
 *   AppIcon.appiconset/AppIcon-1024.png  1024×1024, logo on the site's cream,
 *                                        no transparency (iOS requires it)
 *   LaunchLogo.imageset/LaunchLogo@2x.png / @3x.png
 *
 * Re-run whenever the logo changes.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "public", "logos", "pizza-pazzo-logo.png");
const ASSETS = join(projectRoot, "ios-app", "PizzaPazzo", "Assets.xcassets");

/** The site's background (tailwind.config.ts → pizza.cream). */
const CREAM = { r: 0xfb, g: 0xf6, b: 0xee, alpha: 1 };

const ICON_SIZE = 1024;
/** iOS rounds the corners; keep the logo well inside them. */
const ICON_LOGO_WIDTH = 820;

/** Launch logo width in points (shown centred on the cream launch screen). */
const LAUNCH_WIDTH_PT = 240;

const meta = await sharp(SOURCE).metadata();
console.log(`source: ${meta.width}×${meta.height}`);

async function logoAtWidth(width) {
  const height = Math.round((width * meta.height) / meta.width);
  const buffer = await sharp(SOURCE)
    .resize({ width, height, fit: "contain", kernel: "lanczos3", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return { buffer, width, height };
}

// App icon: opaque, square, logo centred.
{
  const logo = await logoAtWidth(ICON_LOGO_WIDTH);
  const dir = join(ASSETS, "AppIcon.appiconset");
  mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: ICON_SIZE, height: ICON_SIZE, channels: 3, background: CREAM } })
    .composite([
      {
        input: logo.buffer,
        left: Math.round((ICON_SIZE - logo.width) / 2),
        top: Math.round((ICON_SIZE - logo.height) / 2),
      },
    ])
    .flatten({ background: CREAM })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(join(dir, "AppIcon-1024.png"));
  console.log(`  AppIcon-1024.png: ${ICON_SIZE}×${ICON_SIZE}, logo ${logo.width}×${logo.height}`);
}

// Launch logo: transparent, at 2× and 3×.
{
  const dir = join(ASSETS, "LaunchLogo.imageset");
  mkdirSync(dir, { recursive: true });
  for (const scale of [2, 3]) {
    const logo = await logoAtWidth(LAUNCH_WIDTH_PT * scale);
    await sharp(logo.buffer).png({ compressionLevel: 9 }).toFile(join(dir, `LaunchLogo@${scale}x.png`));
    console.log(`  LaunchLogo@${scale}x.png: ${logo.width}×${logo.height}`);
  }
}

console.log("done");
