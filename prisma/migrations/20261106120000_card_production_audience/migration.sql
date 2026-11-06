-- Who is offered REAL card payment (ОББ production terminal), switched from
-- Admin → Settings: "staff" | "everyone"; NULL = follow the server's
-- PAYMENT_PRODUCTION_AUDIENCE. See lib/payments/production-audience.ts.
ALTER TABLE "RestaurantSettings" ADD COLUMN "cardProductionAudience" TEXT;
