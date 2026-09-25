-- Anonymising an order after its customer deletes their account.
--
-- Until now deleting an account only detached the orders (`userId` -> NULL)
-- and left the name, e-mail, phone and delivery address sitting in every one
-- of them. The privacy policy promised the opposite, and a promise like that
-- is the one thing Google reads before anything else.
--
-- What the restaurant actually has to keep is the accounting record: the
-- number, the date, the items and the sums. Who ate the pizza is not part of
-- it, so those columns are scrubbed — see lib/privacy.ts for the values.
--
-- `anonymizedAt` records when that happened, so an order can never be scrubbed
-- twice and the admin can say honestly why a row has no customer on it.
--
-- `anonymizePending` covers the order that is still in the oven when the
-- account goes: the driver needs the address, so the scrub waits for DELIVERED
-- or CANCELLED and happens in setOrderStatus().
--
-- Plain ADD COLUMN — both are nullable or defaulted, the shape SQLite can add
-- in place, so existing rows survive untouched under `migrate deploy`.
--
-- No backfill: accounts deleted before this migration are already gone, and
-- their orders can no longer be told apart from a guest's. Those stay as they
-- are; the retention wording in the policy covers them.

ALTER TABLE "Order" ADD COLUMN "anonymizedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "anonymizePending" BOOLEAN NOT NULL DEFAULT false;
