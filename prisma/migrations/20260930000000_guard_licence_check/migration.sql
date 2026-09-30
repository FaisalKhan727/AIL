-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "licenceCheckStatus" TEXT,
ADD COLUMN     "licenceCheckMessage" TEXT,
ADD COLUMN     "licenceCheckedAt" TIMESTAMP(3),
ADD COLUMN     "larsName" TEXT,
ADD COLUMN     "larsLicenceType" TEXT,
ADD COLUMN     "larsExpiry" TIMESTAMP(3),
ADD COLUMN     "larsActivities" TEXT;
