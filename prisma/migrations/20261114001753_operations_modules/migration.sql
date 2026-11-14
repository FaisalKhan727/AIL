-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'PROFESSIONAL';

-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "subcontractorId" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abn" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "billingEmail" TEXT,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 14,
    "slaPatrolPct" INTEGER NOT NULL DEFAULT 95,
    "slaAlarmMins" INTEGER NOT NULL DEFAULT 15,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alarm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ref" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,
    "zone" TEXT,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "guardId" TEXT,
    "etaMins" INTEGER,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "onSceneAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "outcome" TEXT,
    "sopDone" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Alarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmEvent" (
    "id" TEXT NOT NULL,
    "alarmId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "AlarmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ref" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,
    "guardId" TEXT,
    "alarmId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "zone" TEXT,
    "narrative" TEXT NOT NULL,
    "persons" TEXT,
    "lossValue" DECIMAL(65,30),
    "assignedTo" TEXT,
    "notifyClient" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentUpdate" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "IncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentPhoto" (
    "incidentId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "IncidentPhoto_pkey" PRIMARY KEY ("incidentId")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rego" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "odometer" INTEGER,
    "serviceDue" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCheck" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "guardId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer" INTEGER,
    "fuel" TEXT,
    "failed" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,

    CONSTRAINT "VehicleCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serial" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "guardId" TEXT,
    "notes" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatrolRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolStop" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "instructions" TEXT,

    CONSTRAINT "PatrolStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "guardId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "stopCount" INTEGER NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "invoiceId" TEXT,

    CONSTRAINT "PatrolJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolScan" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "stopName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "PatrolScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "gstRate" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "jobId" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "renewalMonths" INTEGER,
    "passMark" INTEGER NOT NULL DEFAULT 80,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "dueAt" TIMESTAMP(3),
    "score" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abn" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "specialties" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "rating" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "siteId" TEXT,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "period" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Alarm_companyId_status_idx" ON "Alarm"("companyId", "status");

-- CreateIndex
CREATE INDEX "Alarm_guardId_idx" ON "Alarm"("guardId");

-- CreateIndex
CREATE UNIQUE INDEX "Alarm_companyId_ref_key" ON "Alarm"("companyId", "ref");

-- CreateIndex
CREATE INDEX "AlarmEvent_alarmId_idx" ON "AlarmEvent"("alarmId");

-- CreateIndex
CREATE INDEX "Incident_companyId_status_idx" ON "Incident"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_companyId_ref_key" ON "Incident"("companyId", "ref");

-- CreateIndex
CREATE INDEX "IncidentUpdate_incidentId_idx" ON "IncidentUpdate"("incidentId");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- CreateIndex
CREATE INDEX "VehicleCheck_companyId_idx" ON "VehicleCheck"("companyId");

-- CreateIndex
CREATE INDEX "VehicleCheck_vehicleId_idx" ON "VehicleCheck"("vehicleId");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE INDEX "PatrolRun_companyId_idx" ON "PatrolRun"("companyId");

-- CreateIndex
CREATE INDEX "PatrolStop_runId_idx" ON "PatrolStop"("runId");

-- CreateIndex
CREATE INDEX "PatrolJob_companyId_date_idx" ON "PatrolJob"("companyId", "date");

-- CreateIndex
CREATE INDEX "PatrolJob_guardId_idx" ON "PatrolJob"("guardId");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolScan_jobId_stopId_key" ON "PatrolScan"("jobId", "stopId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Course_companyId_idx" ON "Course"("companyId");

-- CreateIndex
CREATE INDEX "Enrollment_guardId_idx" ON "Enrollment"("guardId");

-- CreateIndex
CREATE INDEX "Enrollment_companyId_idx" ON "Enrollment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_courseId_guardId_key" ON "Enrollment"("courseId", "guardId");

-- CreateIndex
CREATE INDEX "Subcontractor_companyId_idx" ON "Subcontractor"("companyId");

-- CreateIndex
CREATE INDEX "JobRequest_companyId_idx" ON "JobRequest"("companyId");

-- CreateIndex
CREATE INDEX "SubInvoice_companyId_idx" ON "SubInvoice"("companyId");

-- AddForeignKey
ALTER TABLE "Guard" ADD CONSTRAINT "Guard_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmEvent" ADD CONSTRAINT "AlarmEvent_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "Alarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "Alarm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentUpdate" ADD CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPhoto" ADD CONSTRAINT "IncidentPhoto_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolRun" ADD CONSTRAINT "PatrolRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolRun" ADD CONSTRAINT "PatrolRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolStop" ADD CONSTRAINT "PatrolStop_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PatrolRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolJob" ADD CONSTRAINT "PatrolJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PatrolRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolScan" ADD CONSTRAINT "PatrolScan_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PatrolJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequest" ADD CONSTRAINT "JobRequest_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
