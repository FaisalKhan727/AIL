-- CreateTable
CREATE TABLE "GuardAvailability" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardAvailability_guardId_key" ON "GuardAvailability"("guardId");

-- AddForeignKey
ALTER TABLE "GuardAvailability" ADD CONSTRAINT "GuardAvailability_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
