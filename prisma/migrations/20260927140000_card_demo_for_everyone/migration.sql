-- Card-payment demo for EVERY visitor, guests included (user decision
-- 2026-09-27). Until now it was STAFF: only signed-in staff/admins saw the
-- card option, so a customer without an account never did.
--
-- Still the simulator, no real money: every demo order is a test order
-- ("ТЕСТ — НЕ ПРИГОТВЯЙ"), never e-mailed and never counted as revenue.
-- Admin → Settings can switch it back to STAFF or OFF at any time.
UPDATE "RestaurantSettings" SET "cardDemoMode" = 'EVERYONE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'restaurant';
