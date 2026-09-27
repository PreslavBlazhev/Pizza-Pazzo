-- Start the live site with an empty order book (user decision 2026-09-27).
--
-- Every order so far was placed while building and testing the site — none is
-- a real customer's. They are removed once, on the next deploy; the menu,
-- accounts, settings and print templates are untouched. Order numbers start
-- again from 1 (they are assigned as max + 1 in lib/checkout/place-order.ts).
--
-- Children first: SQLite enforces ON DELETE CASCADE only while
-- PRAGMA foreign_keys is on, so nothing here relies on it.
DELETE FROM "PaymentAttempt";
DELETE FROM "OrderItem";
DELETE FROM "Order";
DELETE FROM "PaymentSimulatorSession";
