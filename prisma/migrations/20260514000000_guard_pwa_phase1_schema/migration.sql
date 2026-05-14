-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_guardId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "brandColour" TEXT;

-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "guardIdentityId" TEXT;


-- CreateTable
CREATE TABLE "GuardIdentity" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardAccount" (
    "id" TEXT NOT NULL,
    "guardIdentityId" TEXT NOT NULL,
    "pinHash" TEXT,
    "backupEmail" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3),
    "appActivated" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardSession" (
    "id" TEXT NOT NULL,
    "guardAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "guardAccountId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "lastSuccessfulPushAt" TIMESTAMP(3),
    "lastFailedPushAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupToken" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "guardIdentityId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardPreferences" (
    "id" TEXT NOT NULL,
    "guardAccountId" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loneWorkerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAppDispatch" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAppDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClockEvent" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "distanceFromSite" DECIMAL(65,30),
    "flaggedDistance" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GUARD_APP',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCheckIn" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "checkInType" TEXT NOT NULL,
    "prompt" TEXT,
    "photoUrl" TEXT,
    "notes" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT,
    "guardId" TEXT NOT NULL,
    "siteId" TEXT,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "peopleInvolved" TEXT,
    "witnessesPresent" BOOLEAN NOT NULL DEFAULT false,
    "policeCalled" BOOLEAN NOT NULL DEFAULT false,
    "policeDetails" TEXT,
    "ambulanceCalled" BOOLEAN NOT NULL DEFAULT false,
    "ambulanceDetails" TEXT,
    "photoUrls" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoneWorkerCheckIn" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "response" TEXT,
    "responseLatitude" DECIMAL(65,30),
    "responseLongitude" DECIMAL(65,30),
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoneWorkerCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardIdentity_phone_key" ON "GuardIdentity"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "GuardIdentity_email_key" ON "GuardIdentity"("email");

-- CreateIndex
CREATE INDEX "GuardIdentity_phone_idx" ON "GuardIdentity"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "GuardAccount_guardIdentityId_key" ON "GuardAccount"("guardIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardSession_tokenHash_key" ON "GuardSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuardSession_guardAccountId_idx" ON "GuardSession"("guardAccountId");

-- CreateIndex
CREATE INDEX "GuardSession_expiresAt_idx" ON "GuardSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_guardAccountId_idx" ON "PushSubscription"("guardAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupToken_tokenHash_key" ON "SetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SetupToken_guardId_idx" ON "SetupToken"("guardId");

-- CreateIndex
CREATE INDEX "SetupToken_expiresAt_idx" ON "SetupToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardPreferences_guardAccountId_key" ON "GuardPreferences"("guardAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAppDispatch_guardId_key" ON "CompanyAppDispatch"("guardId");

-- CreateIndex
CREATE INDEX "ClockEvent_shiftId_idx" ON "ClockEvent"("shiftId");

-- CreateIndex
CREATE INDEX "ClockEvent_guardId_idx" ON "ClockEvent"("guardId");

-- CreateIndex
CREATE INDEX "ClockEvent_companyId_idx" ON "ClockEvent"("companyId");

-- CreateIndex
CREATE INDEX "ClockEvent_timestamp_idx" ON "ClockEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ShiftCheckIn_shiftId_idx" ON "ShiftCheckIn"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftCheckIn_guardId_idx" ON "ShiftCheckIn"("guardId");

-- CreateIndex
CREATE INDEX "ShiftCheckIn_companyId_idx" ON "ShiftCheckIn"("companyId");

-- CreateIndex
CREATE INDEX "IncidentReport_guardId_idx" ON "IncidentReport"("guardId");

-- CreateIndex
CREATE INDEX "IncidentReport_companyId_idx" ON "IncidentReport"("companyId");

-- CreateIndex
CREATE INDEX "IncidentReport_status_idx" ON "IncidentReport"("status");

-- CreateIndex
CREATE INDEX "IncidentReport_severity_idx" ON "IncidentReport"("severity");

-- CreateIndex
CREATE INDEX "LoneWorkerCheckIn_shiftId_idx" ON "LoneWorkerCheckIn"("shiftId");

-- CreateIndex
CREATE INDEX "LoneWorkerCheckIn_guardId_idx" ON "LoneWorkerCheckIn"("guardId");

-- CreateIndex
CREATE INDEX "LoneWorkerCheckIn_companyId_idx" ON "LoneWorkerCheckIn"("companyId");

-- CreateIndex
CREATE INDEX "LoneWorkerCheckIn_scheduledAt_idx" ON "LoneWorkerCheckIn"("scheduledAt");

-- CreateIndex
CREATE INDEX "Guard_guardIdentityId_idx" ON "Guard"("guardIdentityId");

-- AddForeignKey
ALTER TABLE "Guard" ADD CONSTRAINT "Guard_guardIdentityId_fkey" FOREIGN KEY ("guardIdentityId") REFERENCES "GuardIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardAccount" ADD CONSTRAINT "GuardAccount_guardIdentityId_fkey" FOREIGN KEY ("guardIdentityId") REFERENCES "GuardIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardSession" ADD CONSTRAINT "GuardSession_guardAccountId_fkey" FOREIGN KEY ("guardAccountId") REFERENCES "GuardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_guardAccountId_fkey" FOREIGN KEY ("guardAccountId") REFERENCES "GuardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupToken" ADD CONSTRAINT "SetupToken_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupToken" ADD CONSTRAINT "SetupToken_guardIdentityId_fkey" FOREIGN KEY ("guardIdentityId") REFERENCES "GuardIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardPreferences" ADD CONSTRAINT "GuardPreferences_guardAccountId_fkey" FOREIGN KEY ("guardAccountId") REFERENCES "GuardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAppDispatch" ADD CONSTRAINT "CompanyAppDispatch_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCheckIn" ADD CONSTRAINT "ShiftCheckIn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCheckIn" ADD CONSTRAINT "ShiftCheckIn_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCheckIn" ADD CONSTRAINT "ShiftCheckIn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoneWorkerCheckIn" ADD CONSTRAINT "LoneWorkerCheckIn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoneWorkerCheckIn" ADD CONSTRAINT "LoneWorkerCheckIn_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoneWorkerCheckIn" ADD CONSTRAINT "LoneWorkerCheckIn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

