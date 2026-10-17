import { getPurgeState } from "@/lib/order-purge";
import { formatSofiaTime } from "@/lib/store-hours";
import { formatSofiaDate } from "@/lib/report-period";

const when = (d: Date | null | undefined) => (d ? `${formatSofiaDate(d)} ${formatSofiaTime(d)}` : "—");

/**
 * "Ежедневно почистване" on the admin dashboard: when tonight's orders were
 * REALLY deleted (and by which trigger, how late after 22:30), and any
 * failure — so a broken scheduler or a backup that could not be cleaned is
 * seen by a person, not only in a log. Unavailability at 22:30 does not
 * depend on this; physical deletion does.
 */
export async function RetentionStatus() {
  const s = await getPurgeState().catch(() => null);
  const failed = !!s?.lastError;
  let backupErrors: { file: string; error: string }[] = [];
  try {
    backupErrors = s?.lastBackupErrors ? JSON.parse(s.lastBackupErrors) : [];
  } catch {
    backupErrors = [];
  }
  return (
    <section
      className={`mt-8 rounded-2xl border p-4 text-sm ${failed ? "border-red-300 bg-red-50" : "border-neutral-200 bg-white"}`}
      data-testid="retention-status"
    >
      <h2 className="mb-2 font-semibold text-neutral-700">Ежедневно почистване (22:30)</h2>
      {!s?.lastRunAt ? (
        <p className="text-neutral-500">Още не е изпълнявано на този сървър.</p>
      ) : (
        <ul className="space-y-1 text-neutral-700">
          <li>
            Изтрити до cutoff {when(s.lastCutoffAt)}
            {s.lastCutoffLagSeconds !== null && s.lastCutoffLagSeconds !== undefined
              ? ` — ${s.lastCutoffLagSeconds} s след 22:30 (${s.lastCutoffTrigger ?? "?"})`
              : ""}
          </li>
          <li>
            Последно изпълнение: {when(s.lastRunAt)} ({s.lastTrigger ?? "?"}); последен успех: {when(s.lastSuccessAt)}
          </li>
          {failed && (
            <li className="font-semibold text-red-700">
              ГРЕШКА: {s.lastError}
              {backupErrors.length > 0 && (
                <ul className="ml-4 list-disc font-normal">
                  {backupErrors.map((b) => (
                    <li key={b.file}>
                      {b.file}: {b.error}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
