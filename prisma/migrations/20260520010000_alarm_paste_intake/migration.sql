-- AlterTable
ALTER TABLE "AlarmJob" ADD COLUMN     "areaLabel" TEXT,
ADD COLUMN     "bureau" TEXT,
ADD COLUMN     "parseConfidence" TEXT,
ADD COLUMN     "parserUsed" TEXT,
ADD COLUMN     "rawIntakeText" TEXT,
ADD COLUMN     "zoneLabel" TEXT;


-- CreateTable
CREATE TABLE "GeocodedAddress" (
    "id" TEXT NOT NULL,
    "normalisedAddress" TEXT NOT NULL,
    "latitude" DECIMAL(65,30) NOT NULL,
    "longitude" DECIMAL(65,30) NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodedAddress_normalisedAddress_key" ON "GeocodedAddress"("normalisedAddress");

-- CreateIndex
CREATE INDEX "GeocodedAddress_normalisedAddress_idx" ON "GeocodedAddress"("normalisedAddress");

