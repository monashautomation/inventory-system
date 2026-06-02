-- AlterTable
ALTER TABLE "PrintQueueSubmission" ADD COLUMN     "capturedLogEntryId" INTEGER;

-- CreateIndex
CREATE INDEX "PrintQueueSubmission_capturedLogEntryId_idx" ON "PrintQueueSubmission"("capturedLogEntryId");
