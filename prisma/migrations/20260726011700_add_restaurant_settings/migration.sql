-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'restaurant',
    "addressBg" TEXT NOT NULL,
    "addressEn" TEXT NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "contactEmail" TEXT NOT NULL,
    "mondayOpen" BOOLEAN NOT NULL DEFAULT true,
    "mondayFrom" TEXT,
    "mondayTo" TEXT,
    "tuesdayOpen" BOOLEAN NOT NULL DEFAULT true,
    "tuesdayFrom" TEXT,
    "tuesdayTo" TEXT,
    "wednesdayOpen" BOOLEAN NOT NULL DEFAULT true,
    "wednesdayFrom" TEXT,
    "wednesdayTo" TEXT,
    "thursdayOpen" BOOLEAN NOT NULL DEFAULT true,
    "thursdayFrom" TEXT,
    "thursdayTo" TEXT,
    "fridayOpen" BOOLEAN NOT NULL DEFAULT true,
    "fridayFrom" TEXT,
    "fridayTo" TEXT,
    "saturdayOpen" BOOLEAN NOT NULL DEFAULT true,
    "saturdayFrom" TEXT,
    "saturdayTo" TEXT,
    "sundayOpen" BOOLEAN NOT NULL DEFAULT true,
    "sundayFrom" TEXT,
    "sundayTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Seed the single canonical row with the values the site publishes today
-- (lib/constants.ts: SITE + WORKING_HOURS). Done here rather than in the seed
-- script so that `prisma migrate deploy` alone leaves production with valid
-- settings. `INSERT OR IGNORE` keeps the migration safe to re-run.
INSERT OR IGNORE INTO "RestaurantSettings" (
    "id", "addressBg", "addressEn", "primaryPhone", "secondaryPhone", "contactEmail",
    "mondayOpen", "mondayFrom", "mondayTo",
    "tuesdayOpen", "tuesdayFrom", "tuesdayTo",
    "wednesdayOpen", "wednesdayFrom", "wednesdayTo",
    "thursdayOpen", "thursdayFrom", "thursdayTo",
    "fridayOpen", "fridayFrom", "fridayTo",
    "saturdayOpen", "saturdayFrom", "saturdayTo",
    "sundayOpen", "sundayFrom", "sundayTo",
    "createdAt", "updatedAt"
) VALUES (
    'restaurant',
    'Плевен, ул. Георги Кочев 13 (Срещу Технополис)',
    '13 Georgi Kochev St., Pleven (opposite Technopolis)',
    '+359 88 248 4777',
    '+359 801 999',
    'orderspp@gmail.com',
    true, '11:00', '23:00',
    true, '11:00', '23:00',
    true, '11:00', '23:00',
    true, '11:00', '23:00',
    true, '11:00', '23:00',
    true, '11:00', '23:00',
    true, '11:00', '22:30',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
