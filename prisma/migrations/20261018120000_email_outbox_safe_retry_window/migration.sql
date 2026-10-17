-- Customer e-mail outbox: a durable window for SAFE automatic retries.
-- Resend remembers an idempotency key for 24 hours. A retry after that could
-- deliver the e-mail a second time if an earlier attempt was accepted but its
-- answer was lost, so automatic retries of an unclear attempt stop at
-- firstAttemptAt + 23 h (lib/email/outbox.ts). Additive only: no row is
-- deleted, no status is changed.
ALTER TABLE "EmailOutbox" ADD COLUMN "firstAttemptAt" DATETIME;
ALTER TABLE "EmailOutbox" ADD COLUMN "safeRetryUntil" DATETIME;
ALTER TABLE "EmailOutbox" ADD COLUMN "ambiguousAttempt" BOOLEAN NOT NULL DEFAULT false;

-- Rows already attempted before this migration: the first attempt was at or
-- after the row was created, so a window counted from createdAt ends no later
-- than the real one (conservative). Prisma stores DateTime as integer ms.
UPDATE "EmailOutbox"
   SET "firstAttemptAt" = "createdAt",
       "safeRetryUntil" = "createdAt" + 82800000
 WHERE "attempts" > 0 AND typeof("createdAt") = 'integer';

-- A row still waiting to retry (or caught mid-send) may have been accepted
-- already: treat its outcome as unclear.
UPDATE "EmailOutbox"
   SET "ambiguousAttempt" = true
 WHERE "attempts" > 0 AND "status" IN ('RETRY', 'SENDING');
