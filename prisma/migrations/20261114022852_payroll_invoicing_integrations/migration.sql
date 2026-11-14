-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "externalContactId" TEXT;

-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'CASUAL',
ADD COLUMN     "externalEmployeeId" TEXT,
ADD COLUMN     "payrollRef" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "breakMins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "payRunId" TEXT,
ADD COLUMN     "tsApprovedAt" TIMESTAMP(3),
ADD COLUMN     "tsApprovedBy" TEXT,
ADD COLUMN     "tsNote" TEXT,
ADD COLUMN     "tsStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "billRate" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "superRate" DECIMAL(65,30) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalisedAt" TIMESTAMP(3),
    "finalisedBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "exportedTo" TEXT,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunLine" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "shiftId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "hours" DECIMAL(65,30) NOT NULL,
    "baseRate" DECIMAL(65,30) NOT NULL,
    "multiplier" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "superable" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "PayRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "connectedBy" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "PayRun_companyId_idx" ON "PayRun"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_companyId_number_key" ON "PayRun"("companyId", "number");

-- CreateIndex
CREATE INDEX "PayRunLine_payRunId_idx" ON "PayRunLine"("payRunId");

-- CreateIndex
CREATE INDEX "PayRunLine_guardId_idx" ON "PayRunLine"("guardId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_companyId_date_key" ON "PublicHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_companyId_provider_key" ON "Integration"("companyId", "provider");

-- CreateIndex
CREATE INDEX "SyncLog_companyId_at_idx" ON "SyncLog"("companyId", "at");

-- CreateIndex
CREATE INDEX "Shift_payRunId_idx" ON "Shift"("payRunId");

-- CreateIndex
CREATE INDEX "Shift_invoiceId_idx" ON "Shift"("invoiceId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
