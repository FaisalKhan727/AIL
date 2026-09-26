-- Per-shift payroll overrides: an admin can correct one shift's payable
-- hours, and/or pay one shift at a different rate than the guard's usual
-- rate. Both nullable, purely additive (ADD COLUMN only) — every existing
-- row gets NULL, which is exactly "no override, behave as before".

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "hoursOverride" DECIMAL(65,30),
ADD COLUMN "payRateOverride" DECIMAL(65,30);
