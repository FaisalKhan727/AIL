-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_guardId_fkey";

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "clockInAt" TIMESTAMP(3),
ADD COLUMN     "clockOutAt" TIMESTAMP(3),
ADD COLUMN     "clockInLat" DOUBLE PRECISION,
ADD COLUMN     "clockInLng" DOUBLE PRECISION,
ADD COLUMN     "clockOutLat" DOUBLE PRECISION,
ADD COLUMN     "clockOutLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Licence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'VIC',
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifyMethod" TEXT,
    "verifyNote" TEXT,
    "lastAlertDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Licence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenceDocument" (
    "licenceId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenceDocument_pkey" PRIMARY KEY ("licenceId")
);

-- CreateTable
CREATE TABLE "LicenceEvent" (
    "id" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "LicenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Licence_companyId_idx" ON "Licence"("companyId");

-- CreateIndex
CREATE INDEX "Licence_guardId_idx" ON "Licence"("guardId");

-- CreateIndex
CREATE INDEX "Licence_expiryDate_idx" ON "Licence"("expiryDate");

-- CreateIndex
CREATE INDEX "LicenceEvent_licenceId_idx" ON "LicenceEvent"("licenceId");

-- CreateIndex
CREATE INDEX "GuardOtp_phone_createdAt_idx" ON "GuardOtp"("phone", "createdAt");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licence" ADD CONSTRAINT "Licence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licence" ADD CONSTRAINT "Licence_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceDocument" ADD CONSTRAINT "LicenceDocument_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "Licence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceEvent" ADD CONSTRAINT "LicenceEvent_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "Licence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every guard that already has a licence number on file gets a
-- matching row in the new registry (unverified, so it shows up in the
-- verification queue rather than silently counting as compliant).
INSERT INTO "Licence" ("id", "companyId", "guardId", "type", "number", "state", "expiryDate", "verification", "source", "createdAt", "updatedAt")
SELECT 'lic_' || md5(g."id" || 'legacy'), g."companyId", g."id", 'SECURITY_1A', g."licenceNumber", 'VIC', g."licenceExpiry", 'UNVERIFIED', 'IMPORT', now(), now()
FROM "Guard" g
WHERE g."licenceNumber" IS NOT NULL AND btrim(g."licenceNumber") <> '';
