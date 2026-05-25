
-- CreateTable
CREATE TABLE "AlarmInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "alarmIds" TEXT NOT NULL,
    "alarmCount" INTEGER NOT NULL,
    "ratePerAlarm" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,

    CONSTRAINT "AlarmInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlarmInvoice_companyId_periodYear_periodMonth_idx" ON "AlarmInvoice"("companyId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "AlarmInvoice_companyId_source_periodYear_periodMonth_key" ON "AlarmInvoice"("companyId", "source", "periodYear", "periodMonth");

