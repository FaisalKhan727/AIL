-- AlterTable
ALTER TABLE "SmsLog" ADD COLUMN     "alarmJobId" TEXT,
ADD COLUMN     "alarmResponderId" TEXT;


-- CreateTable
CREATE TABLE "AlarmJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docket" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT,
    "alarmType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'HIGH',
    "siteName" TEXT NOT NULL,
    "siteAddress" TEXT NOT NULL,
    "siteLatitude" DECIMAL(65,30),
    "siteLongitude" DECIMAL(65,30),
    "siteId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "specialInstructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISPATCHED',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AlarmJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmResponder" (
    "id" TEXT NOT NULL,
    "alarmJobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "responderType" TEXT NOT NULL,
    "guardId" TEXT,
    "externalName" TEXT,
    "externalPhone" TEXT NOT NULL,
    "externalCompany" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchSmsLogId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "onsiteAt" TIMESTAMP(3),
    "offsiteAt" TIMESTAMP(3),
    "responseResult" TEXT,
    "responseRawBody" TEXT,
    "responseSmsLogId" TEXT,

    CONSTRAINT "AlarmResponder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlarmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "alarmJobId" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt" TIMESTAMP(3),
    "emailSentTo" TEXT,
    "emailDelivered" BOOLEAN NOT NULL DEFAULT false,
    "emailFailureReason" TEXT,

    CONSTRAINT "AlarmReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlarmJob_companyId_idx" ON "AlarmJob"("companyId");

-- CreateIndex
CREATE INDEX "AlarmJob_companyId_status_idx" ON "AlarmJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "AlarmJob_companyId_receivedAt_idx" ON "AlarmJob"("companyId", "receivedAt");

-- CreateIndex
CREATE INDEX "AlarmJob_siteId_idx" ON "AlarmJob"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "AlarmJob_companyId_docket_key" ON "AlarmJob"("companyId", "docket");

-- CreateIndex
CREATE INDEX "AlarmResponder_alarmJobId_idx" ON "AlarmResponder"("alarmJobId");

-- CreateIndex
CREATE INDEX "AlarmResponder_externalPhone_idx" ON "AlarmResponder"("externalPhone");

-- CreateIndex
CREATE INDEX "AlarmResponder_guardId_idx" ON "AlarmResponder"("guardId");

-- CreateIndex
CREATE INDEX "AlarmResponder_companyId_idx" ON "AlarmResponder"("companyId");

-- CreateIndex
CREATE INDEX "AlarmContact_companyId_active_idx" ON "AlarmContact"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AlarmContact_companyId_phone_key" ON "AlarmContact"("companyId", "phone");

-- CreateIndex
CREATE INDEX "AlarmReport_alarmJobId_idx" ON "AlarmReport"("alarmJobId");

-- CreateIndex
CREATE INDEX "AlarmReport_companyId_idx" ON "AlarmReport"("companyId");

-- CreateIndex
CREATE INDEX "SmsLog_alarmJobId_idx" ON "SmsLog"("alarmJobId");

-- CreateIndex
CREATE INDEX "SmsLog_alarmResponderId_idx" ON "SmsLog"("alarmResponderId");

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_alarmJobId_fkey" FOREIGN KEY ("alarmJobId") REFERENCES "AlarmJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_alarmResponderId_fkey" FOREIGN KEY ("alarmResponderId") REFERENCES "AlarmResponder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmJob" ADD CONSTRAINT "AlarmJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmJob" ADD CONSTRAINT "AlarmJob_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmResponder" ADD CONSTRAINT "AlarmResponder_alarmJobId_fkey" FOREIGN KEY ("alarmJobId") REFERENCES "AlarmJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmResponder" ADD CONSTRAINT "AlarmResponder_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmContact" ADD CONSTRAINT "AlarmContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmReport" ADD CONSTRAINT "AlarmReport_alarmJobId_fkey" FOREIGN KEY ("alarmJobId") REFERENCES "AlarmJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmReport" ADD CONSTRAINT "AlarmReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

