-- Per-company Supervisor flag on Guard. Additive only (ADD COLUMN with a
-- default), so every existing guard becomes isSupervisor=false — no
-- behaviour change until an admin explicitly promotes someone.

-- AlterTable
ALTER TABLE "Guard" ADD COLUMN "isSupervisor" BOOLEAN NOT NULL DEFAULT false;
