-- AlterTable
ALTER TABLE "Item" ADD COLUMN "notes" TEXT,
ADD COLUMN "notesUpdatedByUserId" TEXT,
ADD COLUMN "notesUpdatedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_notesUpdatedByUserId_fkey" FOREIGN KEY ("notesUpdatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
