"use client";

import { useActionState, useMemo, useState } from "react";
import {
  resetPrintTemplateAction,
  updatePrintTemplateAction,
} from "@/app/actions/admin-print";
import { FormAlert } from "@/components/ui/FormAlert";
import { buildTicket, toTicketText } from "@/lib/printer/ticket-template";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import {
  MAX_PRINT_FONT_PT,
  MAX_PRINT_SCALE,
  MIN_PRINT_FONT_PT,
  MIN_PRINT_SCALE,
  PAPER_WIDTHS_MM,
  PRINT_SECTIONS,
  type PrintAlign,
  type PrintSectionId,
  type PrintSectionStyle,
  type PrintTemplateData,
} from "@/types/print";
import type { ActionResult } from "@/types/auth";
import { cn } from "@/lib/utils";

/**
 * The print template editor — what prints, how big, where.
 *
 * Everything is controlled state so the preview on the right can re-render on
 * every keystroke; the same values are ALSO submitted as ordinary named inputs,
 * so the form still saves correctly and the server reads plain FormData.
 *
 * Two size columns is not redundancy, it is the hardware being honest:
 * `pt` reaches a browser printer, `scale` (1×–4×) is all an ESC/POS thermal
 * printer can do. The owner sets both once and the ticket looks right wherever
 * it comes out.
 */

const ALIGN_OPTIONS: { value: PrintAlign; label: string }[] = [
  { value: "left", label: "Ляво" },
  { value: "center", label: "Център" },
  { value: "right", label: "Дясно" },
];

const SCALE_LABELS: Record<number, string> = {
  1: "1× нормален",
  2: "2× голям",
  3: "3× много голям",
  4: "4× огромен",
};

type PreviewMode = "paper" | "thermal";

function NumberField({
  label,
  name,
  value,
  onChange,
  step = "1",
  min,
  max,
  error,
  hint,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min?: number;
  max?: number;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-pizza-ink">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition",
          "focus:ring-2 focus:ring-pizza-green/30",
          error ? "border-brand" : "border-pizza-cream-dark"
        )}
      />
      {hint && !error && <span className="mt-1 block text-xs text-pizza-muted">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-medium text-brand">
          {error}
        </span>
      )}
    </label>
  );
}

export function PrintTemplateForm({ template }: { template: PrintTemplateData }) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updatePrintTemplateAction,
    null
  );
  const [resetState, resetAction, isResetting] = useActionState<ActionResult | null, FormData>(
    resetPrintTemplateAction,
    null
  );

  // Keyed by template id so switching tabs re-seeds the draft from the server.
  const [draft, setDraft] = useState<PrintTemplateData>(template);
  const [preview, setPreview] = useState<PreviewMode>("paper");

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  const setField = <K extends keyof PrintTemplateData>(key: K, value: PrintTemplateData[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setSection = (id: PrintSectionId, patch: Partial<PrintSectionStyle>) =>
    setDraft((d) => ({
      ...d,
      sections: { ...d.sections, [id]: { ...d.sections[id], ...patch } },
    }));

  const lines = useMemo(
    () => buildTicket(SAMPLE_PRINT_ORDER, draft, { isReprint: false }),
    [draft]
  );
  const thermalText = useMemo(() => toTicketText(lines, draft), [lines, draft]);

  const visibleCount = PRINT_SECTIONS.filter((s) => draft.sections[s.id].visible).length;

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form action={formAction} className="space-y-6" noValidate>
        <input type="hidden" name="templateId" value={draft.id} />

        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
        {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
        {resetState?.error && <FormAlert tone="error">{resetState.error}</FormAlert>}
        {resetState?.ok && resetState.message && (
          <FormAlert tone="success">{resetState.message}</FormAlert>
        )}

        {/* ── Paper ──────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">Хартия и шаблон</h2>
          <p className="mt-1 text-sm text-pizza-muted">
            Ширината и полетата важат за печат през браузъра; символите на ред и
            празните редове — за термо принтера на таблета.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-pizza-ink">
                Име на бележката
              </span>
              <input
                type="text"
                name="name"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30",
                  fieldError("name") ? "border-brand" : "border-pizza-cream-dark"
                )}
              />
              {fieldError("name") && (
                <span role="alert" className="mt-1 block text-xs font-medium text-brand">
                  {fieldError("name")}
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-pizza-ink">
                Ширина на хартията
              </span>
              <select
                name="paperWidthMm"
                value={draft.paperWidthMm}
                onChange={(e) => setField("paperWidthMm", Number(e.target.value))}
                className="w-full rounded-lg border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30"
              >
                {PAPER_WIDTHS_MM.map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} mm
                  </option>
                ))}
              </select>
            </label>

            <NumberField
              label="Символи на ред"
              name="charsPerLine"
              value={draft.charsPerLine}
              onChange={(v) => setField("charsPerLine", v)}
              min={20}
              max={96}
              hint="80 mm ≈ 42–48, 58 mm ≈ 32"
              error={fieldError("charsPerLine")}
            />

            <NumberField
              label="Поле (mm)"
              name="marginMm"
              value={draft.marginMm}
              onChange={(v) => setField("marginMm", v)}
              step="0.5"
              min={0}
              max={20}
              error={fieldError("marginMm")}
            />

            <NumberField
              label="Разстояние между редовете"
              name="lineHeight"
              value={draft.lineHeight}
              onChange={(v) => setField("lineHeight", v)}
              step="0.05"
              min={0.8}
              max={3}
              error={fieldError("lineHeight")}
            />

            <NumberField
              label="Копия"
              name="copies"
              value={draft.copies}
              onChange={(v) => setField("copies", v)}
              min={1}
              max={5}
              hint="Само за термо принтера"
              error={fieldError("copies")}
            />

            <NumberField
              label="Празни редове след бележката"
              name="feedLinesAfter"
              value={draft.feedLinesAfter}
              onChange={(v) => setField("feedLinesAfter", v)}
              min={0}
              max={20}
              hint="За да мине покрай ножа"
              error={fieldError("feedLinesAfter")}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-pizza-ink">
                Заглавен текст
              </span>
              <input
                type="text"
                name="headerText"
                value={draft.headerText}
                onChange={(e) => setField("headerText", e.target.value)}
                className="w-full rounded-lg border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-pizza-ink">
                Долен текст
              </span>
              <input
                type="text"
                name="footerText"
                value={draft.footerText}
                onChange={(e) => setField("footerText", e.target.value)}
                placeholder="напр. Благодарим Ви!"
                className="w-full rounded-lg border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-pizza-ink">
              <input
                type="checkbox"
                name="showDividers"
                checked={draft.showDividers}
                onChange={(e) => setField("showDividers", e.target.checked)}
                className="h-4 w-4 rounded border-pizza-cream-dark accent-pizza-green"
              />
              Разделителни линии
            </label>
            <label className="flex items-center gap-2 text-sm text-pizza-ink">
              <input
                type="checkbox"
                name="autoCut"
                checked={draft.autoCut}
                onChange={(e) => setField("autoCut", e.target.checked)}
                className="h-4 w-4 rounded border-pizza-cream-dark accent-pizza-green"
              />
              Автоматично рязане (термо)
            </label>
          </div>
        </section>

        {/* ── Sections ───────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">
            Какво се принтира
          </h2>
          <p className="mt-1 text-sm text-pizza-muted">
            Изключете каквото не Ви трябва. <strong>pt</strong> е размерът при
            печат от браузъра; <strong>термо</strong> е увеличението на термо
            принтера — той не разбира от pt, а само от 1×–4×.
          </p>
          <p className="mt-1 text-xs text-pizza-muted">
            Включени секции: {visibleCount} от {PRINT_SECTIONS.length}
          </p>

          <div className="mt-4 space-y-2">
            {PRINT_SECTIONS.map((section) => {
              const style = draft.sections[section.id];
              const can = (c: string) =>
                (section.controls as readonly string[]).includes(c);
              const off = !style.visible;

              return (
                <div
                  key={section.id}
                  className={cn(
                    "rounded-xl border p-3 transition",
                    off
                      ? "border-pizza-cream-dark bg-pizza-cream/40"
                      : "border-pizza-cream-dark bg-white"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex min-w-[13rem] flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        name={`section.${section.id}.visible`}
                        checked={style.visible}
                        onChange={(e) =>
                          setSection(section.id, { visible: e.target.checked })
                        }
                        className="h-4 w-4 shrink-0 rounded border-pizza-cream-dark accent-pizza-green"
                      />
                      <span>
                        <span
                          className={cn(
                            "block text-sm font-medium",
                            off ? "text-pizza-muted" : "text-pizza-ink"
                          )}
                        >
                          {section.label}
                        </span>
                        {section.hint && (
                          <span className="block text-xs text-pizza-muted">
                            {section.hint}
                          </span>
                        )}
                      </span>
                    </label>

                    {can("size") && (
                      <>
                        <label className="flex items-center gap-1.5 text-xs text-pizza-muted">
                          pt
                          <input
                            type="number"
                            name={`section.${section.id}.fontPt`}
                            value={style.fontPt}
                            step="0.5"
                            min={MIN_PRINT_FONT_PT}
                            max={MAX_PRINT_FONT_PT}
                            disabled={off}
                            onChange={(e) =>
                              setSection(section.id, { fontPt: Number(e.target.value) })
                            }
                            className="w-20 rounded-lg border border-pizza-cream-dark bg-white px-2 py-1.5 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30 disabled:opacity-50"
                          />
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-pizza-muted">
                          термо
                          <select
                            name={`section.${section.id}.scale`}
                            value={style.scale}
                            disabled={off}
                            onChange={(e) =>
                              setSection(section.id, { scale: Number(e.target.value) })
                            }
                            className="rounded-lg border border-pizza-cream-dark bg-white px-2 py-1.5 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30 disabled:opacity-50"
                          >
                            {Array.from(
                              { length: MAX_PRINT_SCALE - MIN_PRINT_SCALE + 1 },
                              (_, i) => i + MIN_PRINT_SCALE
                            ).map((n) => (
                              <option key={n} value={n}>
                                {SCALE_LABELS[n]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {can("align") && (
                      <select
                        name={`section.${section.id}.align`}
                        value={style.align}
                        disabled={off}
                        aria-label={`Позиция: ${section.label}`}
                        onChange={(e) =>
                          setSection(section.id, { align: e.target.value as PrintAlign })
                        }
                        className="rounded-lg border border-pizza-cream-dark bg-white px-2 py-1.5 text-sm text-pizza-ink outline-none transition focus:ring-2 focus:ring-pizza-green/30 disabled:opacity-50"
                      >
                        {ALIGN_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {can("bold") && (
                      <label className="flex items-center gap-1.5 text-xs text-pizza-muted">
                        <input
                          type="checkbox"
                          name={`section.${section.id}.bold`}
                          checked={style.bold}
                          disabled={off}
                          onChange={(e) =>
                            setSection(section.id, { bold: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-pizza-cream-dark accent-pizza-green disabled:opacity-50"
                        />
                        <span className="font-bold">Ж</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hidden mirrors: a disabled input is not submitted, so the values of
              switched-off sections would be lost on save. These keep them. */}
          {PRINT_SECTIONS.map((section) => {
            const style = draft.sections[section.id];
            const can = (c: string) => (section.controls as readonly string[]).includes(c);
            const off = !style.visible;
            return (
              <div key={`mirror-${section.id}`} hidden>
                {(off || !can("size")) && (
                  <>
                    <input
                      type="hidden"
                      name={`section.${section.id}.fontPt`}
                      value={style.fontPt}
                    />
                    <input
                      type="hidden"
                      name={`section.${section.id}.scale`}
                      value={style.scale}
                    />
                  </>
                )}
                {(off || !can("align")) && (
                  <input
                    type="hidden"
                    name={`section.${section.id}.align`}
                    value={style.align}
                  />
                )}
                {(off || !can("bold")) && style.bold && (
                  <input type="hidden" name={`section.${section.id}.bold`} value="on" />
                )}
              </div>
            );
          })}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-pizza-green-dark disabled:opacity-60"
          >
            {isPending ? "Запазване…" : "Запази настройките"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(template)}
            className="rounded-xl border border-pizza-cream-dark px-5 py-2.5 text-sm font-medium text-pizza-ink transition hover:bg-pizza-cream"
          >
            Отмени промените
          </button>
        </div>
      </form>

      {/* ── Live preview ─────────────────────────────────────────────── */}
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="rounded-2xl border border-pizza-cream-dark bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-pizza-ink">Преглед</h2>
            <div className="flex rounded-lg border border-pizza-cream-dark p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPreview("paper")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition",
                  preview === "paper"
                    ? "bg-pizza-ink text-white"
                    : "text-pizza-muted hover:text-pizza-ink"
                )}
              >
                Браузър
              </button>
              <button
                type="button"
                onClick={() => setPreview("thermal")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition",
                  preview === "thermal"
                    ? "bg-pizza-ink text-white"
                    : "text-pizza-muted hover:text-pizza-ink"
                )}
              >
                Термо
              </button>
            </div>
          </div>

          <p className="mt-1.5 text-xs text-pizza-muted">
            {preview === "paper"
              ? "Както ще излезе от принтера през браузъра, в реален размер."
              : "Както ще излезе от термо принтера на таблета (моноширинен шрифт)."}
          </p>

          <div className="mt-3 overflow-x-auto rounded-xl bg-neutral-100 p-3">
            {preview === "paper" ? (
              <div
                className="mx-auto bg-white font-mono text-black shadow-sm"
                style={{
                  width: `${draft.paperWidthMm}mm`,
                  padding: `${draft.marginMm}mm`,
                  lineHeight: draft.lineHeight,
                }}
              >
                {lines.map((line, i) =>
                  line.divider ? (
                    <div
                      key={i}
                      aria-hidden
                      className="my-1 border-t border-dashed border-black"
                    />
                  ) : (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2",
                        line.align === "center"
                          ? "justify-center text-center"
                          : line.align === "right"
                            ? "justify-end text-right"
                            : "justify-start text-left"
                      )}
                      style={{
                        fontSize: `${line.fontPt}pt`,
                        fontWeight: line.bold ? 700 : 400,
                      }}
                    >
                      <span className="whitespace-pre-wrap break-words">{line.text}</span>
                      {line.right && (
                        <span className="ml-auto whitespace-nowrap">{line.right}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <pre className="whitespace-pre text-[11px] leading-tight text-black">
                {thermalText}
              </pre>
            )}
          </div>

          <p className="mt-2 text-[11px] text-pizza-muted">
            Примерна поръчка — истинските бележки ползват данните на поръчката.
          </p>
        </div>

        <form action={resetAction} className="mt-3">
          <input type="hidden" name="templateId" value={draft.id} />
          <button
            type="submit"
            disabled={isResetting}
            className="w-full rounded-xl border border-pizza-cream-dark px-4 py-2 text-sm font-medium text-pizza-muted transition hover:bg-pizza-cream hover:text-pizza-ink disabled:opacity-60"
          >
            {isResetting ? "Връщане…" : "Върни фабричните настройки"}
          </button>
        </form>
      </aside>
    </div>
  );
}
