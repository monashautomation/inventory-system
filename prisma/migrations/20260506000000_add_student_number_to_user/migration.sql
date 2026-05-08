-- AlterTable
ALTER TABLE "user" ADD COLUMN "studentNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_studentNumber_key" ON "user"("studentNumber");
