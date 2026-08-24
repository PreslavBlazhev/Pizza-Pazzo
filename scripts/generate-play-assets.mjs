/**
 * Builds the Google Play store-listing graphics for the kitchen app.
 *
 *     node scripts/generate-play-assets.mjs
 *
 * Idempotent — it only overwrites its own output in
 * `android-app/play-assets/`. Re-run it whenever
 * `public/logos/pizza-pazzo-logo.png` changes.
 *
 * Play's two mandatory graphics have rules that are easy to fail silently:
 *
 * - **App icon, 512×512 PNG.** Play draws its own rounded mask over it, so the
 *   artwork must stay inside a safe circle; and unlike the launcher icon it is
 *   shown on light AND dark surfaces, so a transparent background would leave
 *   red lettering floating on black. Hence a filled cream square — the same
 *   cream as the adaptive icon's background layer, so the store icon and the
 *   one on the tablet are visibly the same icon.
 *
 * - **Feature graphic, 1024×500 PNG/JPG.** No alpha allowed, and Play may crop
 *   the sides on some surfaces, so nothing meaningful goes near the edges: the
 *   logo sits centred at 46% of the width.
 *
 * Screenshots are NOT generated here. Play requires screenshots to show the
 * real app, and faking them is a listing-policy violation — take them on the
 * kitchen tablet (see android-app/PLAY_STORE.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "public", "logos", "pizza-pazzo-logo.png");
const OUT = join(projectRoot, "android-app", "play-assets");

/** Brand cream — same value as `pp_cream` in the Android colors.xml. */
const CREAM = { r: 0xfd, g: 0xf6, b: 0xec, alpha: 1 };

mkdirSync(OUT, { recursive: true });

const meta = await sharp(SOURCE).metadata();
console.log(`source: ${meta.width}×${meta.height}`);

/** Centres the logo, scaled to `fraction` of the canvas width, on cream. */
async function onCream(canvasW, canvasH, fraction, file) {
  const width = Math.round(canvasW * fraction);
  const height = Math.round((width * meta.height) / meta.width);

  const logo = await sharp(SOURCE)
    .resize({ width, height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const out = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: CREAM },
  })
    .composite([
      {
        input: logo,
        left: Math.round((canvasW - width) / 2),
        top: Math.round((canvasH - height) / 2),
      },
    ])
    // Play rejects a feature graphic with transparency. flatten() paints the
    // transparent pixels cream and removeAlpha() drops the channel outright,
    // so nothing downstream can read a fully-opaque alpha as "has transparency".
    .flatten({ background: CREAM })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(join(OUT, file), out);
  console.log(`  ${file}: ${canvasW}×${canvasH}, logo ${width}×${height}`);
}

// 0.72 keeps the logo's corners inside the circle Play's mask leaves visible.
await onCream(512, 512, 0.72, "play-icon-512.png");
await onCream(1024, 500, 0.46, "play-feature-graphic-1024x500.png");

console.log("done");
