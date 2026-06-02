ALTER TABLE "PrintQueueSubmission"
  ADD COLUMN "bambuddyQueueCreatedAt" TIMESTAMP(3),
  ADD COLUMN "archiveId"              INTEGER,
  ADD COLUMN "archiveName"            TEXT,
  ADD COLUMN "capturedStatus"         TEXT,
  ADD COLUMN "capturedAt"             TIMESTAMP(3),
  ADD COLUMN "capturedStartedAt"      TIMESTAMP(3),
  ADD COLUMN "capturedCompletedAt"    TIMESTAMP(3),
  ADD COLUMN "capturedFilamentGrams"  DOUBLE PRECISION,
  ADD COLUMN "capturedFilamentType"   TEXT,
  ADD COLUMN "capturedFilamentColor"  TEXT,
  ADD COLUMN "capturedPrinterId"      INTEGER,
  ADD COLUMN "capturedPrinterName"    TEXT;

CREATE INDEX "PrintQueueSubmission_capturedStatus_idx"
  ON "PrintQueueSubmission"("capturedStatus");

CREATE INDEX "PrintQueueSubmission_capturedStartedAt_capturedPrinterId_idx"
  ON "PrintQueueSubmission"("capturedStartedAt", "capturedPrinterId");
