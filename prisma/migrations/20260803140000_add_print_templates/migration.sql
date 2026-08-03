-- Print templates: the kitchen slip and the delivery slip, styled from
-- /admin/settings/print.
--
-- Both rows are inserted here rather than by a seed script, so a plain
-- `migrate deploy` on Render leaves the app with working templates.
--
-- `sectionsJson` starts as '{}' on purpose: lib/print-templates.ts merges the
-- stored object over the per-template defaults in types/print.ts, so an empty
-- object means "everything at factory settings". The first admin save writes
-- the full object.

-- CreateTable
CREATE TABLE "PrintTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
    "charsPerLine" INTEGER NOT NULL DEFAULT 42,
    "marginMm" REAL NOT NULL DEFAULT 3,
    "lineHeight" REAL NOT NULL DEFAULT 1.25,
    "headerText" TEXT NOT NULL DEFAULT 'PIZZA PAZZO',
    "footerText" TEXT NOT NULL DEFAULT '',
    "showDividers" BOOLEAN NOT NULL DEFAULT true,
    "feedLinesAfter" INTEGER NOT NULL DEFAULT 4,
    "autoCut" BOOLEAN NOT NULL DEFAULT true,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "sectionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT OR IGNORE INTO "PrintTemplate" ("id", "name", "footerText", "updatedAt")
VALUES ('KITCHEN', 'КУХНЯ', '', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PrintTemplate" ("id", "name", "footerText", "updatedAt")
VALUES ('DELIVERY', 'ДОСТАВКА', 'Благодарим Ви!', CURRENT_TIMESTAMP);
