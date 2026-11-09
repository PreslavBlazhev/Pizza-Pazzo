/**
 * The Pizza Pazzo logo at the top of a printed ticket.
 *
 * The image is the ORIGINAL logo (lettering + every ornament) converted to
 * black on white by scripts/generate-print-logo.mjs — never redrawn with a
 * font. When it prints, it takes the place of the header text; the header
 * text stays in the ticket model only as the fallback for when the image
 * cannot be loaded.
 *
 * Size is the same physical size on both print paths:
 *   - 58 mm paper → 36 mm wide (288 dots at 203 dpi on the thermal printer)
 *   - 80 mm paper → 48 mm wide (384 dots)
 * Height follows the logo's own proportions — never stretched or cropped.
 */

export const PRINT_LOGO_SRC = "/logos/pizza-pazzo-logo-print.png";
/** Pixel size of PRINT_LOGO_SRC (trimmed to the logo). */
export const PRINT_LOGO_WIDTH_PX = 528;
export const PRINT_LOGO_HEIGHT_PX = 298;

/** Printed logo width in millimetres for a paper width. */
export function printLogoWidthMm(paperWidthMm: number, marginMm = 0): number {
  const preferred = paperWidthMm <= 58 ? 36 : 48;
  // Never wider than the space between the margins.
  const content = Math.max(10, paperWidthMm - 2 * marginMm);
  return Math.min(preferred, content);
}

/** Fraction of the paper's print width the logo occupies (thermal preview). */
export function printLogoWidthFraction(paperWidthMm: number): number {
  // Printable area of common ESC/POS printers: 48 mm on 58 mm, 72 mm on 80 mm.
  const printable = paperWidthMm <= 58 ? 48 : 72;
  return Math.min(1, printLogoWidthMm(paperWidthMm) / printable);
}
