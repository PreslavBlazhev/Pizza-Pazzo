/**
 * Builds the Android launcher icon out of the real Pizza Pazzo logo.
 *
 *     node scripts/generate-android-icons.mjs
 *
 * Idempotent: it only ever overwrites its own output, so re-run it whenever
 * `public/logos/pizza-pazzo-logo.png` changes.
 *
 * What it produces is the FOREGROUND layer of an adaptive icon —
 * `ic_launcher_foreground.png` in every `mipmap-<density>` folder of
 * android-kitchen-app. The background is a flat cream vector kept in the
 * Android project.
 *
 * The one rule that shapes everything here: an adaptive icon is 108dp, but
 * launchers may mask it down to a 72dp circle, so all artwork has to live in
 * the middle two thirds. The logo is 1.77:1, and its widest points (the tips
 * of the green filigree) sit at mid-height while its tallest points sit at the
 * centre — so fitting its WIDTH to exactly 72dp puts every extremity on or
 * inside that circle. Fitting the height instead would waste half the space.
 *
 * The same asset doubles as the splash icon: `windowSplashScreenAnimatedIcon`
 * uses the identical "content within the middle two thirds" convention.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "public", "logos", "pizza-pazzo-logo.png");
const RES = join(projectRoot, "android-kitchen-app", "app", "src", "main", "res");

/** Adaptive-icon canvas is 108dp; the guaranteed-visible circle is 72dp. */
const CANVAS_DP = 108;
const SAFE_DP = 72;

/** Android density buckets, as multiples of mdpi. */
const DENSITIES = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

const logo = sharp(SOURCE);
const meta = await logo.metadata();
console.log(`source: ${meta.width}×${meta.height}`);

for (const [bucket, scale] of DENSITIES) {
  const canvas = Math.round(CANVAS_DP * scale);
  const width = Math.round(SAFE_DP * scale);
  const height = Math.round((width * meta.height) / meta.width);

  const resized = await sharp(SOURCE)
    .resize({ width, height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const out = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((canvas - width) / 2),
        top: Math.round((canvas - height) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const dir = join(RES, `mipmap-${bucket}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher_foreground.png"), out);
  console.log(`  mipmap-${bucket}: ${canvas}×${canvas} canvas, logo ${width}×${height}`);
}

console.log("done");
