-- The purge job records what really happened (lib/order-purge.ts): the
-- trigger of each run, the last success, how late the deletion of each
-- cutoff's orders was, and the backup files it could not clean.
-- Additive only.
ALTER TABLE "MaintenanceState" ADD COLUMN "lastTrigger" TEXT;
ALTER TABLE "MaintenanceState" ADD COLUMN "lastSuccessAt" DATETIME;
ALTER TABLE "MaintenanceState" ADD COLUMN "lastCutoffLagSeconds" INTEGER;
ALTER TABLE "MaintenanceState" ADD COLUMN "lastCutoffTrigger" TEXT;
ALTER TABLE "MaintenanceState" ADD COLUMN "lastBackupsScrubbed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaintenanceState" ADD COLUMN "lastBackupErrors" TEXT;
