-- Multi-tenant migration: introduces Company, scopes existing data to a default
-- "Auswide Security" company, and creates "ACS Security" so a separate admin
-- login can be added afterwards.

-- 1. Company table.
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- 2. Seed the two companies. Stable IDs so we can backfill safely.
INSERT INTO "Company" ("id", "name", "slug") VALUES
  ('co_auswide', 'Auswide Security', 'auswide'),
  ('co_acs',     'ACS Security',     'acs');

-- 3. Add companyId to existing tenant-scoped tables. Nullable first, backfill
--    everything to Auswide (the only existing tenant), then enforce NOT NULL.
ALTER TABLE "AdminUser" ADD COLUMN "companyId" TEXT;
UPDATE "AdminUser" SET "companyId" = 'co_auswide' WHERE "companyId" IS NULL;
ALTER TABLE "AdminUser" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AdminUser_companyId_idx" ON "AdminUser"("companyId");

ALTER TABLE "Guard" ADD COLUMN "companyId" TEXT;
UPDATE "Guard" SET "companyId" = 'co_auswide' WHERE "companyId" IS NULL;
ALTER TABLE "Guard" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Guard" ADD CONSTRAINT "Guard_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Guard_companyId_idx" ON "Guard"("companyId");

ALTER TABLE "Site" ADD COLUMN "companyId" TEXT;
UPDATE "Site" SET "companyId" = 'co_auswide' WHERE "companyId" IS NULL;
ALTER TABLE "Site" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Site_companyId_idx" ON "Site"("companyId");

ALTER TABLE "Roster" ADD COLUMN "companyId" TEXT;
UPDATE "Roster" SET "companyId" = 'co_auswide' WHERE "companyId" IS NULL;
ALTER TABLE "Roster" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Roster_companyId_idx" ON "Roster"("companyId");

-- 4. Setting: change PK from (key) to (companyId, key) and backfill.
ALTER TABLE "Setting" ADD COLUMN "companyId" TEXT;
UPDATE "Setting" SET "companyId" = 'co_auswide' WHERE "companyId" IS NULL;
ALTER TABLE "Setting" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey";
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("companyId", "key");
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Seed ACS Security default settings (mirrors the Auswide seed defaults).
INSERT INTO "Setting" ("companyId", "key", "value") VALUES
  ('co_acs', 'company_name',               'ACS Security'),
  ('co_acs', 'timezone',                   'Australia/Melbourne'),
  ('co_acs', 'default_pay_rate',           '38.50'),
  ('co_acs', 'sms_template_roster',        E'Hi {firstName}, your shifts for {rosterName}:\n\n{shiftList}\n\nReply with shift # + YES/NO for each.\nE.g. "1 YES, 2 NO, 3 YES"\nOr reply ALL YES / ALL NO.\n\nRef: {firstConfirmCode}'),
  ('co_acs', 'sms_template_reply_summary', 'Thanks {firstName}. Confirmed: {confirmedCount}, Rejected: {rejectedCount}, Pending: {pendingCount}.'),
  ('co_acs', 'sms_template_unparsed',      E'Hi {firstName}, we couldn''t read your reply. Please reply with shift # then YES or NO (e.g. "1 YES, 2 NO") or ALL YES / ALL NO.');

-- 6. Bootstrap ACS Security OWNER admin so the new login works immediately.
--    Password "Allied@2026" hashed with bcrypt cost 10. Change after first login.
INSERT INTO "AdminUser" ("id", "email", "passwordHash", "name", "role", "companyId")
VALUES (
  'admin_acs_seed',
  'info@alliedcs.com.au',
  '$2a$10$Zp6X7ahx9pQEXG1ySOVcqOqw0WtzTGngwJXz5t0n42QLRlStt2bna',
  'ACS Admin',
  'OWNER',
  'co_acs'
)
ON CONFLICT ("email") DO UPDATE SET
  "companyId" = EXCLUDED."companyId",
  "role"      = EXCLUDED."role";
