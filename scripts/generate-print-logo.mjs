#!/usr/bin/env node
/**
 * Builds the PRINT versions of the original Pizza Pazzo logo
 * (public/logos/pizza-pazzo-logo.png — the red "PIZZA PAZZO" lettering with
 * the green filigree, transparent background).
 *
 * The logo is not redrawn: every output is derived from the original file's
 * alpha channel, so the lettering and every ornament stay exactly as they
 * are, only in black on white. The colour, the background and anything that
 * is not part of the logo itself never reach a ticket.
 *
 * Outputs:
 *   public/logos/pizza-pazzo-logo-print.png
 *       Browser print path. Black on white, trimmed to the logo, full source
 *       resolution with antialiased edges (the printer driver dithers).
 *   android-app/app/src/main/res/raw/receipt_logo_288.bin   (58 mm paper)
 *   android-app/app/src/main/res/raw/receipt_logo_384.bin   (80 mm paper)
 *       Thermal path. A ready 1-bit raster at the exact dot width the app
 *       prints — no image decoding or scaling happens on the tablet, so the
 *       ESC/POS bytes are deterministic and unit-testable on the JVM.
 *       Format: "PPL1" | u16 BE bytes-per-row | u16 BE rows | rows × bytes,
 *       MSB = leftmost dot, 1 = black (exactly the GS v 0 data layout).
 *
 * Widths: 288 dots = 36 mm at 203 dpi (75 % of the 48 mm print area of a
 * 58 mm printer), 384 dots = 48 mm (2/3 of the 72 mm area of 80 mm paper).
 * The browser path uses the same millimetres (lib/printer/ticket-logo.ts).
 *
 *   node scripts/generate-print-logo.mjs [--preview <dir>]
 *
 * --preview writes the 1-bit rasters back out as PNGs to eyeball them.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "public/logos/pizza-pazzo-logo.png");
const WEB_OUT = path.join(ROOT, "public/logos/pizza-pazzo-logo-print.png");
const RAW_DIR = path.join(ROOT, "android-app/app/src/main/res/raw");
const THERMAL_WIDTHS = [288, 384];
/** Alpha at or above this (after resampling) prints black. Slightly under 50 %
 *  so the thinnest filigree tips survive the downscale. */
const THRESHOLD = 110;

const previewIdx = process.argv.indexOf("--preview");
const previewDir = previewIdx > 0 ? process.argv[previewIdx + 1] : null;

/** The logo's coverage as a single grey channel: 255 = logo, 0 = nothing. */
async function coverage() {
  const { data: rgba, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  // Trim the transparent border so the logo — not empty canvas — sets the size.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * channels + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[y * width + x] = rgba[((y + minY) * w + (x + minX)) * channels + 3];
  return { data, width, height };
}

const cov = await coverage();
const covImage = () => sharp(cov.data, { raw: { width: cov.width, height: cov.height, channels: 1 } });

// ── Browser: black on white, antialiased ──
await covImage().negate().png({ compressionLevel: 9 }).toFile(WEB_OUT);
console.log(`web     ${path.relative(ROOT, WEB_OUT)}  ${cov.width}×${cov.height}`);

// ── Thermal: 1-bit rasters ──
mkdirSync(RAW_DIR, { recursive: true });
if (previewDir) mkdirSync(previewDir, { recursive: true });

for (const width of THERMAL_WIDTHS) {
  const { data, info } = await covImage()
    .resize({ width, kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bytesPerRow = Math.ceil(info.width / 8);
  const rows = info.height;
  const out = Buffer.alloc(8 + bytesPerRow * rows);
  out.write("PPL1", 0, "ascii");
  out.writeUInt16BE(bytesPerRow, 4);
  out.writeUInt16BE(rows, 6);
  let black = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels] >= THRESHOLD) {
        out[8 + y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        black++;
      }
    }
  }
  const file = path.join(RAW_DIR, `receipt_logo_${width}.bin`);
  writeFileSync(file, out);
  console.log(
    `thermal ${path.relative(ROOT, file)}  ${bytesPerRow * 8}×${rows} dots ` +
      `(${(bytesPerRow * 8 / 8).toFixed(0)}×${(rows / 8).toFixed(1)} mm), ${((black / (info.width * rows)) * 100).toFixed(1)}% black`
  );

  if (previewDir) {
    const px = Buffer.alloc(bytesPerRow * 8 * rows, 255);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < bytesPerRow * 8; x++)
        if (out[8 + y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) px[y * bytesPerRow * 8 + x] = 0;
    await sharp(px, { raw: { width: bytesPerRow * 8, height: rows, channels: 1 } })
      .png()
      .toFile(path.join(previewDir, `receipt_logo_${width}.png`));
  }
}
