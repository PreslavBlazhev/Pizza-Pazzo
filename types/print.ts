/**
 * Print templates — what goes on a ticket, how big, where.
 *
 * ONE model drives BOTH print paths, which have genuinely different
 * capabilities. Be precise about which knob reaches which printer:
 *
 * - **Web (browser Ctrl+P)** honours `fontPt` literally — a real point size,
 *   plus alignment, bold, page width and margins. Any printer, any size.
 * - **Thermal (Bluetooth ESC/POS, the kitchen tablet)** has no concept of
 *   points. The hardware offers a base font multiplied 1×–4× in width and
 *   height (`GS ! n`) and left/centre/right alignment (`ESC a n`). That is what
 *   `scale` means, and it is the honest ceiling of that path.
 *
 * The owner edits both numbers side by side in /admin/settings/print, so a
 * ticket looks the way they want on whichever printer actually runs it.
 */

// ── Templates ───────────────────────────────────────────────────────────────

/** The two tickets a single order produces. Row ids in the database. */
export const PRINT_TEMPLATE_IDS = ["KITCHEN", "DELIVERY"] as const;
export type PrintTemplateId = (typeof PRINT_TEMPLATE_IDS)[number];

export function isPrintTemplateId(value: unknown): value is PrintTemplateId {
  return typeof value === "string" && (PRINT_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** URL/query form ("kitchen") → row id ("KITCHEN"). Defaults to KITCHEN. */
export function printTemplateIdFromParam(value: string | undefined): PrintTemplateId {
  const upper = (value ?? "").toUpperCase();
  return isPrintTemplateId(upper) ? upper : "KITCHEN";
}

// ── Style primitives ────────────────────────────────────────────────────────

export const PRINT_ALIGNMENTS = ["left", "center", "right"] as const;
export type PrintAlign = (typeof PRINT_ALIGNMENTS)[number];

/** Thermal size multiplier. 1 = base font, 4 = quadruple width AND height. */
export const MIN_PRINT_SCALE = 1;
export const MAX_PRINT_SCALE = 4;

/** Point-size bounds for the browser path (0.5pt steps in the UI). */
export const MIN_PRINT_FONT_PT = 6;
export const MAX_PRINT_FONT_PT = 48;

/** How one section is rendered. */
export interface PrintSectionStyle {
  /** Off = the section is not printed at all, on either path. */
  visible: boolean;
  /** Browser font size in points. Ignored by the thermal printer. */
  fontPt: number;
  /** Thermal size multiplier 1–4. Ignored by the browser. */
  scale: number;
  align: PrintAlign;
  bold: boolean;
}

// ── Section registry ────────────────────────────────────────────────────────

/**
 * Which style controls a section actually responds to. `price` is a column on
 * the item row rather than a line of its own, so only its visibility means
 * anything — the form greys the rest out instead of offering dead knobs.
 */
export type PrintSectionControl = "visible" | "size" | "align" | "bold";

const FULL_CONTROLS: readonly PrintSectionControl[] = ["visible", "size", "align", "bold"];

export interface PrintSectionDefinition {
  id: string;
  /** Bulgarian label shown in the admin (the panel is BG-only by design). */
  label: string;
  /** One line telling the owner what this actually prints. */
  hint: string;
  controls: readonly PrintSectionControl[];
}

/**
 * Every section, in the order it prints. Adding one here makes it appear in
 * the admin form and in both renderers; stored rows that predate it fall back
 * to the default below, so no migration is needed for a new section.
 */
export const PRINT_SECTIONS = [
  { id: "header", label: "Заглавие", hint: "Името на ресторанта най-отгоре.", controls: FULL_CONTROLS },
  { id: "ticketType", label: "Вид бележка", hint: "„КУХНЯ“ или „ДОСТАВКА“ под заглавието.", controls: FULL_CONTROLS },
  { id: "orderNumber", label: "Номер на поръчка", hint: "„ПОРЪЧКА #1042“.", controls: FULL_CONTROLS },
  { id: "reprint", label: "Повторен печат", hint: "Предупреждението при второ принтиране.", controls: FULL_CONTROLS },
  { id: "createdAt", label: "Час на поръчката", hint: "Кога клиентът е поръчал.", controls: FULL_CONTROLS },
  { id: "acceptedAt", label: "Час на приемане", hint: "Кога кухнята е приела поръчката.", controls: FULL_CONTROLS },
  { id: "eta", label: "Готова за", hint: "Времето, което сте дали при приемане.", controls: FULL_CONTROLS },
  { id: "customerName", label: "Име на клиента", hint: "", controls: FULL_CONTROLS },
  { id: "customerPhone", label: "Телефон", hint: "", controls: FULL_CONTROLS },
  { id: "deliveryType", label: "Доставка / от място", hint: "Начинът на получаване.", controls: FULL_CONTROLS },
  { id: "address", label: "Адрес", hint: "Адресът за доставка с града.", controls: FULL_CONTROLS },
  { id: "items", label: "Ястия", hint: "Редовете с количество и име на ястието.", controls: FULL_CONTROLS },
  { id: "itemSize", label: "Размер на ястието", hint: "Напр. „Размер: 30 см“.", controls: FULL_CONTROLS },
  { id: "itemExtras", label: "Добавки и сосове", hint: "Избраните добавки под всяко ястие.", controls: FULL_CONTROLS },
  { id: "itemNote", label: "Бележка към ястие", hint: "Бележката, която клиентът е написал за ястието.", controls: FULL_CONTROLS },
  { id: "itemPrice", label: "Цена на ред", hint: "Сумата вдясно на всяко ястие.", controls: ["visible"] },
  { id: "payment", label: "Начин на плащане", hint: "", controls: FULL_CONTROLS },
  { id: "totals", label: "Междинна сума и доставка", hint: "Редовете преди общата сума.", controls: FULL_CONTROLS },
  { id: "grandTotal", label: "Обща сума", hint: "Крайната сума за плащане.", controls: FULL_CONTROLS },
  { id: "customerNote", label: "Бележка от клиента", hint: "Общата бележка към поръчката.", controls: FULL_CONTROLS },
  { id: "footer", label: "Долен текст", hint: "Вашият текст най-отдолу (напр. „Благодарим!“).", controls: FULL_CONTROLS },
] as const satisfies readonly PrintSectionDefinition[];

export type PrintSectionId = (typeof PRINT_SECTIONS)[number]["id"];

export const PRINT_SECTION_IDS = PRINT_SECTIONS.map((s) => s.id) as PrintSectionId[];

export function isPrintSectionId(value: unknown): value is PrintSectionId {
  return typeof value === "string" && (PRINT_SECTION_IDS as readonly string[]).includes(value);
}

export type PrintSections = Record<PrintSectionId, PrintSectionStyle>;

// ── Template shape ──────────────────────────────────────────────────────────

export const PAPER_WIDTHS_MM = [58, 80] as const;
export type PaperWidthMm = (typeof PAPER_WIDTHS_MM)[number];

export interface PrintTemplateData {
  id: PrintTemplateId;
  /** Shown on the ticket as the "vid" line and in the admin tab. */
  name: string;
  paperWidthMm: number;
  /** Monospace columns at scale 1 — drives thermal wrapping and text preview. */
  charsPerLine: number;
  /** Page margin in millimetres, browser path only. */
  marginMm: number;
  /** CSS line-height multiplier, browser path only. */
  lineHeight: number;
  headerText: string;
  footerText: string;
  /** The `-----` separator lines between blocks. */
  showDividers: boolean;
  /** Blank lines fed after the ticket so it clears the tear bar (thermal). */
  feedLinesAfter: number;
  /** Send the cut command after printing (ignored by printers with no cutter). */
  autoCut: boolean;
  /** How many copies one print job produces (thermal). */
  copies: number;
  sections: PrintSections;
}

// ── Defaults ────────────────────────────────────────────────────────────────

const style = (
  visible: boolean,
  fontPt: number,
  scale: number,
  align: PrintAlign,
  bold: boolean
): PrintSectionStyle => ({ visible, fontPt, scale, align, bold });

/**
 * The kitchen ticket: big dish names, no money at all. The cooks need to read
 * it across a counter, and prices only add noise to a preparation slip.
 */
const KITCHEN_SECTIONS: PrintSections = {
  header: style(true, 12, 1, "center", true),
  ticketType: style(true, 16, 2, "center", true),
  orderNumber: style(true, 20, 2, "center", true),
  reprint: style(true, 12, 1, "center", true),
  createdAt: style(true, 9, 1, "center", false),
  acceptedAt: style(false, 9, 1, "center", false),
  eta: style(true, 14, 2, "center", true),
  customerName: style(false, 10, 1, "left", false),
  customerPhone: style(false, 10, 1, "left", false),
  deliveryType: style(true, 12, 1, "left", true),
  address: style(false, 10, 1, "left", false),
  items: style(true, 16, 2, "left", true),
  itemSize: style(true, 12, 1, "left", false),
  itemExtras: style(true, 13, 1, "left", true),
  itemNote: style(true, 13, 1, "left", true),
  itemPrice: style(false, 10, 1, "right", false),
  payment: style(false, 10, 1, "left", false),
  totals: style(false, 10, 1, "left", false),
  grandTotal: style(false, 12, 1, "left", true),
  customerNote: style(true, 13, 1, "left", true),
  footer: style(false, 10, 1, "center", false),
};

/** The delivery ticket: who, where, and how much to collect. */
const DELIVERY_SECTIONS: PrintSections = {
  header: style(true, 14, 2, "center", true),
  ticketType: style(true, 12, 1, "center", true),
  orderNumber: style(true, 16, 2, "center", true),
  reprint: style(true, 12, 1, "center", true),
  createdAt: style(true, 9, 1, "center", false),
  acceptedAt: style(true, 9, 1, "center", false),
  eta: style(true, 12, 1, "center", true),
  customerName: style(true, 13, 1, "left", true),
  customerPhone: style(true, 14, 2, "left", true),
  deliveryType: style(true, 11, 1, "left", true),
  address: style(true, 14, 2, "left", true),
  items: style(true, 11, 1, "left", false),
  itemSize: style(true, 9, 1, "left", false),
  itemExtras: style(true, 9, 1, "left", false),
  itemNote: style(true, 10, 1, "left", false),
  itemPrice: style(true, 11, 1, "right", false),
  payment: style(true, 11, 1, "left", true),
  totals: style(true, 10, 1, "left", false),
  grandTotal: style(true, 16, 2, "left", true),
  customerNote: style(true, 11, 1, "left", true),
  footer: style(true, 10, 1, "center", false),
};

const BASE_DEFAULTS = {
  paperWidthMm: 80,
  charsPerLine: 42,
  marginMm: 3,
  lineHeight: 1.25,
  headerText: "PIZZA PAZZO",
  showDividers: true,
  feedLinesAfter: 4,
  autoCut: true,
  copies: 1,
} as const;

/** Factory defaults for a template — also the fallback when a read fails. */
export function defaultPrintTemplate(id: PrintTemplateId): PrintTemplateData {
  const kitchen = id === "KITCHEN";
  return {
    ...BASE_DEFAULTS,
    id,
    name: kitchen ? "КУХНЯ" : "ДОСТАВКА",
    footerText: kitchen ? "" : "Благодарим Ви!",
    sections: { ...(kitchen ? KITCHEN_SECTIONS : DELIVERY_SECTIONS) },
  };
}

/** Human label for a template id (admin tabs, buttons). */
export function printTemplateLabel(id: PrintTemplateId): string {
  return id === "KITCHEN" ? "Кухня" : "Доставка";
}
