-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "dispatchOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispatchOverrideAt" TIMESTAMP(3),
ADD COLUMN     "dispatchOverrideBy" TEXT,
ADD COLUMN     "dispatchOverrideReason" TEXT,
ADD COLUMN     "dispatchOverrideReviewAt" TIMESTAMP(3),
ADD COLUMN     "latestOnboardingSessionId" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED';


-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingData" (
    "id" TEXT NOT NULL,
    "onboardingSessionId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "legalName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "residentialAddress" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "workingRightsStatus" TEXT,
    "visaSubclass" TEXT,
    "visaExpiry" TIMESTAMP(3),
    "visaHoursPerFortnight" INTEGER,
    "tfnEncrypted" TEXT,
    "taxFreeThreshold" BOOLEAN,
    "bankAccountName" TEXT,
    "bankBsbEncrypted" TEXT,
    "bankAccountNumberEncrypted" TEXT,
    "licenceNumber" TEXT,
    "licenceClass" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "licenceFrontPhotoUrl" TEXT,
    "licenceBackPhotoUrl" TEXT,
    "sopVersionId" TEXT,
    "sopAcknowledgedAt" TIMESTAMP(3),
    "contractTemplateVersionId" TEXT,
    "contractSignatureName" TEXT,
    "contractSignedAt" TIMESTAMP(3),
    "contractSignerIp" TEXT,
    "contractSignerUserAgent" TEXT,
    "generatedContractPdfUrl" TEXT,
    "generatedPackagePdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopAcknowledgement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "sopVersionId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "source" TEXT NOT NULL,

    CONSTRAINT "SopAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "onboardingSessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorAdminUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_tokenHash_key" ON "OnboardingSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OnboardingSession_guardId_idx" ON "OnboardingSession"("guardId");

-- CreateIndex
CREATE INDEX "OnboardingSession_companyId_status_idx" ON "OnboardingSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "OnboardingSession_tokenExpiresAt_idx" ON "OnboardingSession"("tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingData_onboardingSessionId_key" ON "OnboardingData"("onboardingSessionId");

-- CreateIndex
CREATE INDEX "OnboardingData_guardId_idx" ON "OnboardingData"("guardId");

-- CreateIndex
CREATE INDEX "OnboardingData_companyId_idx" ON "OnboardingData"("companyId");

-- CreateIndex
CREATE INDEX "SopVersion_companyId_isCurrent_idx" ON "SopVersion"("companyId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "SopVersion_companyId_version_key" ON "SopVersion"("companyId", "version");

-- CreateIndex
CREATE INDEX "SopAcknowledgement_guardId_sopVersionId_idx" ON "SopAcknowledgement"("guardId", "sopVersionId");

-- CreateIndex
CREATE INDEX "SopAcknowledgement_companyId_sopVersionId_idx" ON "SopAcknowledgement"("companyId", "sopVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SopAcknowledgement_guardId_sopVersionId_source_key" ON "SopAcknowledgement"("guardId", "sopVersionId", "source");

-- CreateIndex
CREATE INDEX "ContractTemplate_companyId_isCurrent_idx" ON "ContractTemplate"("companyId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_companyId_version_key" ON "ContractTemplate"("companyId", "version");

-- CreateIndex
CREATE INDEX "OnboardingDocument_guardId_type_idx" ON "OnboardingDocument"("guardId", "type");

-- CreateIndex
CREATE INDEX "OnboardingDocument_companyId_idx" ON "OnboardingDocument"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorAdminUserId_idx" ON "AuditLog"("actorAdminUserId");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingData" ADD CONSTRAINT "OnboardingData_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingData" ADD CONSTRAINT "OnboardingData_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingData" ADD CONSTRAINT "OnboardingData_sopVersionId_fkey" FOREIGN KEY ("sopVersionId") REFERENCES "SopVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingData" ADD CONSTRAINT "OnboardingData_contractTemplateVersionId_fkey" FOREIGN KEY ("contractTemplateVersionId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopVersion" ADD CONSTRAINT "SopVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopAcknowledgement" ADD CONSTRAINT "SopAcknowledgement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopAcknowledgement" ADD CONSTRAINT "SopAcknowledgement_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopAcknowledgement" ADD CONSTRAINT "SopAcknowledgement_sopVersionId_fkey" FOREIGN KEY ("sopVersionId") REFERENCES "SopVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

