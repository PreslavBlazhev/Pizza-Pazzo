/**
 * E-mail job states and their staff wording — pure, safe in the browser
 * (the live board shows them). The worker lives in lib/email/outbox.ts.
 */
export const EMAIL_JOB_STATUSES = [
  "PENDING",
  "SENDING",
  "RETRY",
  "PROVIDER_ACCEPTED",
  "FAILED",
  "SKIPPED",
  /** Unclear whether Resend accepted it, and the safe retry window is over: a person checks. */
  "NEEDS_REVIEW",
] as const;
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number];

/** Attempts in total, the first one included. */
export const MAX_ATTEMPTS = 6;
/** Wait before attempt n+1 (index = attempts made so far − 1). */
export const RETRY_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000] as const;
/** What the kitchen sees about one order's customer e-mail. */
export interface EmailJobView {
  status: EmailJobStatus;
  attempts: number;
  lastError: string | null;
  lastErrorKind: string | null;
  nextAttemptAt: string | null;
}

/** Staff wording for an e-mail job — kept apart from the order's own status. */
export function emailJobLabelBg(job: EmailJobView | null | undefined, hasEmail: boolean): string {
  if (!hasEmail) return "Имейл: клиентът не е дал адрес";
  if (!job) return "Имейл: не е изпращан";
  switch (job.status) {
    case "PENDING":
    case "SENDING":
      return "Имейл: изпраща се…";
    case "RETRY":
      return `Имейл: временен проблем, нов опит (${job.attempts}/${MAX_ATTEMPTS})`;
    case "PROVIDER_ACCEPTED":
      return "Имейл: приет от доставчика (не гарантира входящата поща)";
    case "SKIPPED":
      return `Имейл: не е изпратен — ${job.lastError ?? "пропуснат"}`;
    case "NEEDS_REVIEW":
      return "Имейл: НУЖНА Е ПРОВЕРКА — не е сигурно дали е изпратен; няма автоматичен нов опит. Проверете в Resend → Emails.";
    case "FAILED":
      return job.lastErrorKind === "CONFIG"
        ? `Имейл: НЕ Е ИЗПРАТЕН — настройка: ${job.lastError ?? ""}`
        : `Имейл: НЕ Е ИЗПРАТЕН — ${job.lastError ?? "грешка"}`;
  }
}
