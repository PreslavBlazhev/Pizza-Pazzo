import { cn } from "@/lib/utils";

/**
 * Inline feedback banner for forms — one look for errors and successes across
 * auth, profile and admin.
 */
export function FormAlert({
  tone,
  children,
  className,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    error: "border-brand/30 bg-pizza-red-light text-brand-dark",
    success: "border-pizza-green/30 bg-pizza-green-light text-pizza-green-dark",
    info: "border-pizza-cream-dark bg-pizza-cream text-pizza-ink",
  } as const;

  const icons = { error: "⚠️", success: "✓", info: "ℹ️" } as const;

  return (
    <div
      // Errors interrupt; successes are announced when the reader is idle.
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium",
        tones[tone],
        className
      )}
    >
      <span aria-hidden>{icons[tone]}</span>
      <span>{children}</span>
    </div>
  );
}
