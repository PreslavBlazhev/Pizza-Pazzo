/**
 * The logo at the top of the kitchen and delivery tickets: the header text is
 * marked as the logo's place (and fallback) in the shared ticket model, the
 * Android job asks for the bundled logo, and the print asset is the original
 * logo in black on white at a size that fits 58 and 80 mm paper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildTicket, buildTicketText, DEFAULT_HEADER_TEXT } from "@/lib/printer/ticket-template";
import { buildPrintableOrderJson } from "@/lib/android-printer";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import {
  PRINT_LOGO_HEIGHT_PX,
  PRINT_LOGO_SRC,
  PRINT_LOGO_WIDTH_PX,
  printLogoWidthFraction,
  printLogoWidthMm,
} from "@/lib/printer/ticket-logo";
import { defaultPrintTemplate, PRINT_TEMPLATE_IDS } from "@/types/print";

const ROOT = path.resolve(import.meta.dirname, "..");

for (const id of PRINT_TEMPLATE_IDS) {
  test(`${id}: the header is the logo, with the header text only as its fallback`, () => {
    const template = defaultPrintTemplate(id);
    const lines = buildTicket(SAMPLE_PRINT_ORDER, template);
    const logo = lines.filter((l) => l.logo);
    assert.ok(logo.length > 0, "header lines are marked for the logo");
    assert.ok(logo.every((l) => l.section === "header"));
    // The logo run is the very top of the ticket and nothing else is marked.
    assert.deepEqual(lines.slice(0, logo.length), logo);
    assert.equal(logo.map((l) => l.text).join(" "), "PIZZA PAZZO");
    // The text form (fallback / thermal preview) still carries it exactly once.
    assert.equal(buildTicketText(SAMPLE_PRINT_ORDER, template).split("PIZZA PAZZO").length - 1, 1);
  });
}

test("an empty header text still falls back to PIZZA PAZZO under the logo", () => {
  const template = { ...defaultPrintTemplate("KITCHEN"), headerText: "  " };
  const logo = buildTicket(SAMPLE_PRINT_ORDER, template).filter((l) => l.logo);
  assert.deepEqual(logo.map((l) => l.text), [DEFAULT_HEADER_TEXT]);
});

test("a hidden header prints neither the logo nor the text", () => {
  const base = defaultPrintTemplate("DELIVERY");
  const template = { ...base, sections: { ...base.sections, header: { ...base.sections.header, visible: false } } };
  const lines = buildTicket(SAMPLE_PRINT_ORDER, template);
  assert.equal(lines.filter((l) => l.logo).length, 0);
  assert.ok(!buildTicketText(SAMPLE_PRINT_ORDER, template).includes("PIZZA PAZZO"));
});

test("the Android job asks for the bundled logo on both tickets", () => {
  for (const id of PRINT_TEMPLATE_IDS) {
    const job = JSON.parse(
      buildPrintableOrderJson(
        { ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items! },
        { template: defaultPrintTemplate(id) }
      )
    );
    assert.equal(job.print.headerLogo, true);
    assert.equal(job.print.headerText, "PIZZA PAZZO", "fallback text still travels");
  }
});

test("logo size fits 58 and 80 mm paper and matches the thermal rasters", () => {
  assert.equal(printLogoWidthMm(58), 36); // 288 dots at 8 dots/mm
  assert.equal(printLogoWidthMm(80), 48); // 384 dots
  assert.equal(printLogoWidthMm(58, 3), 36);
  assert.ok(printLogoWidthMm(58, 12) <= 58 - 24, "never wider than the margins allow");
  assert.equal(printLogoWidthFraction(58), 0.75);
  assert.ok(Math.abs(printLogoWidthFraction(80) - 2 / 3) < 1e-9);
  for (const [mm, dots] of [[58, 288], [80, 384]] as const) {
    const bin = readFileSync(path.join(ROOT, `android-app/app/src/main/res/raw/receipt_logo_${dots}.bin`));
    assert.equal(bin.subarray(0, 4).toString("ascii"), "PPL1");
    assert.equal(bin.readUInt16BE(4) * 8, printLogoWidthMm(mm) * 8);
    const rows = bin.readUInt16BE(6);
    assert.ok(Math.abs(rows / dots - PRINT_LOGO_HEIGHT_PX / PRINT_LOGO_WIDTH_PX) < 0.01, "proportions kept");
  }
});

test("the print asset is the logo in black on white, without colour", async () => {
  const file = path.join(ROOT, "public", PRINT_LOGO_SRC);
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, PRINT_LOGO_WIDTH_PX);
  assert.equal(info.height, PRINT_LOGO_HEIGHT_PX);
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (info.channels >= 3) {
      assert.equal(data[i], data[i + 1], "grey only — no red or green left");
      assert.equal(data[i], data[i + 2]);
    }
    if (data[i] < 128) dark++;
  }
  const share = dark / (info.width * info.height);
  assert.ok(share > 0.15 && share < 0.45, `ink share ${share}`);
  // Corners are white paper (no coloured or dark background).
  for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
    assert.equal(data[(y * info.width + x) * info.channels], 255);
  }
});
