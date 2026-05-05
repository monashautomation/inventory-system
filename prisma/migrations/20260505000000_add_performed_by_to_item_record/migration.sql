-- AlterTable: add nullable performedByUserId to ItemRecord
-- Safe for existing rows: NULL means action was self-performed (no admin delegation)
ALTER TABLE "ItemRecord" ADD COLUMN "performedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "ItemRecord_performedByUserId_idx" ON "ItemRecord"("performedByUserId");

-- AddForeignKey
ALTER TABLE "ItemRecord" ADD CONSTRAINT "ItemRecord_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
