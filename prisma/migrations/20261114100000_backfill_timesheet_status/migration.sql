-- Shifts the office already marked as WORKED were, in effect, approved
-- timesheets under the old flow. Carry that over so they don't all land
-- back in the approval queue.
UPDATE "Shift" SET "tsStatus" = 'APPROVED', "tsApprovedAt" = now(), "tsApprovedBy" = 'Migrated (marked worked)'
WHERE "status" = 'WORKED' AND "tsStatus" = 'PENDING';
