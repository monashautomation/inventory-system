-- AlterTable
ALTER TABLE "GcodePrintJob" ADD COLUMN "personalUse" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PrintQueueSubmission" ADD COLUMN "personalUse" BOOLEAN NOT NULL DEFAULT false;
