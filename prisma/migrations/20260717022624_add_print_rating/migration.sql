-- CreateEnum
CREATE TYPE "PrintRatingSmiley" AS ENUM ('GOOD', 'OKAY', 'BAD');

-- CreateEnum
CREATE TYPE "PrintRatingTag" AS ENUM ('GOOD', 'FAILED', 'STOPPED', 'MECHANICAL_ISSUE', 'FILAMENT_ISSUE', 'WARPING', 'STRINGING', 'LAYER_SHIFT', 'OTHER');

-- CreateTable
CREATE TABLE "PrintRating" (
    "id" TEXT NOT NULL,
    "bambuddyId" INTEGER NOT NULL,
    "printerName" TEXT,
    "fileName" TEXT,
    "smiley" "PrintRatingSmiley" NOT NULL,
    "tags" "PrintRatingTag"[],
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintRating_bambuddyId_idx" ON "PrintRating"("bambuddyId");

-- CreateIndex
CREATE INDEX "PrintRating_userId_idx" ON "PrintRating"("userId");

-- CreateIndex
CREATE INDEX "PrintRating_createdAt_idx" ON "PrintRating"("createdAt");

-- AddForeignKey
ALTER TABLE "PrintRating" ADD CONSTRAINT "PrintRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
