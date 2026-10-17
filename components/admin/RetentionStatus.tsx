import { getPurgeState } from "@/lib/order-purge";
import { orderRetentionEnabled } from "@/lib/order-retention";
import { formatSofiaTime } from "@/lib/store-hours";
import { formatSofiaDate } from "@/lib/report-period";

const when = (d: Date | null | undefined) => (d ? `${formatSofiaDate(d)} ${formatSofiaTime(d)}` : "—");
const secs = (n: number | null | undefined) => (n === null || n === undefined ? "?" : `${n} s`);

/**
 * "Ежедневно почистване" on the admin dashboard: when tonight's orders were
 * REALLY deleted (and by which trigger, how late after 22:30), and any
 * failure — so a broken scheduler or a backup that could not be cleaned is
 * seen by a person, not only in a log. Unavailability at 22:30 does not
 * depend on this; physical deletion does.
 */
export async function RetentionStatus() {
  // History kept: say so plainly instead of showing a deletion schedule.
  if (!orderRetentionEnabled()) {
    return (
      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 text-sm" data-testid="retention-status">
        <h2 className="mb-2 font-semibold text-neutral-700">История на поръчките</h2>
        <p className="text-neutral-700" data-testid="retention-disabled">
          Автоматичното изтриване на поръчки е изключено. Всички поръчки се пазят в историята и в отчетите.
        </p>
      </section>
    );
  }
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
          <li data-testid="retention-cutoff">
            Изтрити поръчки до {when(s.lastCutoffAt)}
            {s.lastCutoffCompletedAt ? (
              <>
                {" "}— почистването приключи в {when(s.lastCutoffCompletedAt)},{" "}
                {secs(s.lastCutoffCompletionLagSeconds)} след 22:30 (започна {secs(s.lastCutoffStartLagSeconds)} след
                22:30, {s.lastCutoffTrigger ?? "?"})
              </>
            ) : s.lastCutoffAt ? (
              ` — започна ${secs(s.lastCutoffStartLagSeconds)} след 22:30 (${s.lastCutoffTrigger ?? "?"}; време на приключване не е записано)`
            ) : (
              ""
            )}
          </li>
          <li data-testid="retention-last-run">
            Последно изпълнение: започна {when(s.lastRunAt)}, завърши {when(s.lastFinishedAt)}
            {s.lastDurationMs !== null && s.lastDurationMs !== undefined ? ` (${(s.lastDurationMs / 1000).toFixed(1)} s)` : ""} —{" "}
            {s.lastTrigger ?? "?"}, {failed ? "НЕУСПЕШНО" : "успешно"}
          </li>
          <li>Последно успешно приключване: {when(s.lastSuccessAt)}</li>
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
