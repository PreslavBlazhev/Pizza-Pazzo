/**
 * Thermal printer configuration.
 *
 * v1 uses the browser print dialog on a page optimised for an 80mm thermal
 * printer (see docs/printing-plan.md). Later versions may switch to a network
 * printer or a local print agent.
 */
export const PRINT_CONFIG = {
  /** Paper width in millimetres. */
  paperWidthMm: 80,
  /** Characters per line at the default monospace font (approx.). */
  charsPerLine: 42,
  mode: "browser" as "browser" | "network" | "agent",
  showLogo: true,
  showAllergens: false,
};
