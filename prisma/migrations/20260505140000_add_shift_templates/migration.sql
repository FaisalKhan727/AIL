-- Step 1 of the Shift Templates feature: schema only.
--   * New ShiftTemplate table, owned by a Site (cascade delete with the site).
--   * Shift gains an optional templateId so shifts can record which template
--     spawned them (SET NULL on template delete so deleting a template never
--     deletes shifts).
--   * Shift.guardId becomes nullable so we can later create unassigned
--     placeholder shifts. Existing rows already have guardIds set, so
--     dropping NOT NULL is a pure relaxation — no data changes.
-- Existing roster builder UI/API behaviour is unchanged at this step; this
-- migration is purely additive.

CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "notes" TEXT,
    "daysOfWeek" TEXT NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI,SAT,SUN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payRateMultiplier" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftTemplate_siteId_idx" ON "ShiftTemplate"("siteId");

ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Loosen Shift.guardId so future placeholder shifts can be unassigned.
ALTER TABLE "Shift" ALTER COLUMN "guardId" DROP NOT NULL;

-- Add Shift.templateId + index + FK (SET NULL preserves shift history if a
-- template is later deleted).
ALTER TABLE "Shift" ADD COLUMN "templateId" TEXT;
CREATE INDEX "Shift_templateId_idx" ON "Shift"("templateId");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ShiftTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
