-- AlterTable
ALTER TABLE "ItemRecord" ADD COLUMN "consumed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ItemRecord_consumed_idx" ON "ItemRecord"("consumed");
