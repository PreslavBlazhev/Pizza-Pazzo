-- The purge bookkeeping separates the START of a run from its COMPLETION.
-- The old "lastCutoffLagSeconds" was measured at the start of the run, so it
-- is carried over as "lastCutoffStartLagSeconds"; no completion time is
-- invented for older rows. Bookkeeping only, no order data.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME,
    "lastTrigger" TEXT,
    "lastFinishedAt" DATETIME,
    "lastDurationMs" INTEGER,
    "lastSuccessAt" DATETIME,
    "lastCutoffAt" DATETIME,
    "lastCutoffStartLagSeconds" INTEGER,
    "lastCutoffCompletedAt" DATETIME,
    "lastCutoffCompletionLagSeconds" INTEGER,
    "lastCutoffTrigger" TEXT,
    "lastDeleted" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastBackupsScrubbed" INTEGER NOT NULL DEFAULT 0,
    "lastBackupErrors" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MaintenanceState" ("lastCutoffStartLagSeconds", "id", "lastBackupErrors", "lastBackupsScrubbed", "lastCutoffAt", "lastCutoffTrigger", "lastDeleted", "lastError", "lastRunAt", "lastSuccessAt", "lastTrigger", "updatedAt") SELECT "lastCutoffLagSeconds", "id", "lastBackupErrors", "lastBackupsScrubbed", "lastCutoffAt", "lastCutoffTrigger", "lastDeleted", "lastError", "lastRunAt", "lastSuccessAt", "lastTrigger", "updatedAt" FROM "MaintenanceState";
DROP TABLE "MaintenanceState";
ALTER TABLE "new_MaintenanceState" RENAME TO "MaintenanceState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

