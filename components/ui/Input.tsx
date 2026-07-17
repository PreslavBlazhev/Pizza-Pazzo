import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Small helper text under the field; hidden while an error is shown. */
  hint?: string;
}

export function Input({ label, error, hint, className, id, name, ...props }: InputProps) {
  // Fall back to `name` so the label still targets the input when no explicit
  // id is passed — otherwise clicking the label does nothing.
  const inputId = id ?? name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-pizza-ink">
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "rounded-xl border border-pizza-cream-dark bg-white px-3.5 py-2.5 text-sm text-pizza-ink outline-none transition placeholder:text-pizza-muted/60",
          "focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25",
          error && "border-brand focus:border-brand focus:ring-brand/25",
          className
        )}
        {...props}
      />
      {error ? (
        <span id={`${inputId}-error`} role="alert" className="text-xs font-medium text-brand">
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="text-xs text-pizza-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
