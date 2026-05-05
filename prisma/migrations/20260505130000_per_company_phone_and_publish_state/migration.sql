-- Two related changes shipped together:
-- 1. Allow the same guard phone number to exist once per company (so the same
--    person can be rostered separately by Auswide and ACS) by replacing the
--    global Guard.phone unique with a compound (companyId, phone) unique.
-- 2. Add Shift.publishedAt so individual shifts can be sent to guards on
--    demand instead of every new shift firing an SMS automatically. Existing
--    shifts in already-PUBLISHED rosters are backfilled as already published
--    so prod doesn't suddenly think every historical shift needs re-sending.

-- 1. Per-company unique phone.
DROP INDEX "Guard_phone_key";
CREATE UNIQUE INDEX "Guard_companyId_phone_key" ON "Guard"("companyId", "phone");
CREATE INDEX "Guard_phone_idx" ON "Guard"("phone");

-- 2. Shift.publishedAt.
ALTER TABLE "Shift" ADD COLUMN "publishedAt" TIMESTAMP(3);
UPDATE "Shift"
   SET "publishedAt" = COALESCE(
     (SELECT r."publishedAt" FROM "Roster" r WHERE r."id" = "Shift"."rosterId"),
     NOW()
   )
 WHERE "rosterId" IN (SELECT "id" FROM "Roster" WHERE "status" = 'PUBLISHED');
