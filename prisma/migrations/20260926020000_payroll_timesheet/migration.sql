-- Turn the unused Timesheet stub table into the persisted payroll record
-- backing the new /payroll page. Purely additive (ADD COLUMN only, no
-- drops) so this is safe to run against production even without a data
-- backfill: `approvedAt`/`approvedBy` are left in the table unused rather
-- than dropped, since they're no longer declared in schema.prisma and
-- Prisma Client simply won't reference them.
--
-- companyId/guardId are added NOT NULL without a default because this
-- table has never been written to by any application code (grep the repo:
-- no `prisma.timesheet` call exists before this change) — if that
-- assumption is wrong for some environment, this statement fails cleanly
-- (transaction rolls back, deploy fails, previous deployment keeps
-- serving) rather than corrupting data.

-- AlterTable
ALTER TABLE "Timesheet"
  ADD COLUMN "companyId" TEXT NOT NULL,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paidBy" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Timesheet" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Timesheet_companyId_weekStart_idx" ON "Timesheet"("companyId", "weekStart");

-- CreateIndex
CREATE INDEX "Timesheet_guardId_idx" ON "Timesheet"("guardId");

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
