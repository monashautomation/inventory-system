-- CreateTable
CREATE TABLE "PrintQueueSubmission" (
    "id" TEXT NOT NULL,
    "bambuddyQueueItemId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintQueueSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintQueueSubmission_bambuddyQueueItemId_key" ON "PrintQueueSubmission"("bambuddyQueueItemId");

-- CreateIndex
CREATE INDEX "PrintQueueSubmission_userId_idx" ON "PrintQueueSubmission"("userId");

-- CreateIndex
CREATE INDEX "PrintQueueSubmission_bambuddyQueueItemId_idx" ON "PrintQueueSubmission"("bambuddyQueueItemId");

-- AddForeignKey
ALTER TABLE "PrintQueueSubmission" ADD CONSTRAINT "PrintQueueSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
