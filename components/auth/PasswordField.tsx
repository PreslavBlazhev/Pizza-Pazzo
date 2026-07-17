"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";

/** Password input with a show/hide toggle. */
export function PasswordField({
  label,
  name,
  error,
  hint,
  autoComplete,
  required,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        label={label}
        name={name}
        type={visible ? "text" : "password"}
        error={error}
        hint={hint}
        autoComplete={autoComplete}
        required={required}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Sits below the label row; nudged up when helper/error text is present.
        className="absolute right-3 top-[34px] text-lg text-pizza-muted transition hover:text-pizza-ink"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        tabIndex={-1}
      >
        <span aria-hidden>{visible ? "🙈" : "👁️"}</span>
      </button>
    </div>
  );
}
