"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Dialog used by the admin panel.
 *
 * Handles Escape, backdrop click, background scroll lock and initial focus.
 * Still not a full focus trap — good enough for the admin-only forms it hosts;
 * revisit if it ever wraps customer-facing flows.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const t = useTranslations("common");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);

    // Stop the page behind the dialog from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so keyboard and screen-reader users land here.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-pizza-ink/50 p-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "w-full max-w-lg rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-soft outline-none sm:p-8",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-display text-xl font-semibold text-pizza-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="shrink-0 rounded-full p-1 text-xl leading-none text-pizza-muted transition hover:text-pizza-ink"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
