-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Consumable" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConsumableSupplier" (
    "id" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sku" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumableSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumableRequest" (
    "id" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "supplierId" TEXT,
    "customSupplier" TEXT,
    "customUrl" TEXT,
    "notes" TEXT,
    "purchasedById" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "fulfilledQty" INTEGER,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumableRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumableSupplier_consumableId_idx" ON "ConsumableSupplier"("consumableId");

-- CreateIndex
CREATE INDEX "ConsumableSupplier_consumableId_isPrimary_idx" ON "ConsumableSupplier"("consumableId", "isPrimary");

-- CreateIndex (partial unique: at most one primary supplier per consumable)
CREATE UNIQUE INDEX "ConsumableSupplier_consumableId_isPrimary_unique"
    ON "ConsumableSupplier"("consumableId")
    WHERE "isPrimary" = true;

-- CreateIndex
CREATE INDEX "ConsumableRequest_consumableId_idx" ON "ConsumableRequest"("consumableId");

-- CreateIndex
CREATE INDEX "ConsumableRequest_status_createdAt_idx" ON "ConsumableRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ConsumableRequest_requestedById_idx" ON "ConsumableRequest"("requestedById");

-- CreateIndex
CREATE INDEX "ConsumableRequest_supplierId_idx" ON "ConsumableRequest"("supplierId");

-- AddForeignKey
ALTER TABLE "ConsumableSupplier" ADD CONSTRAINT "ConsumableSupplier_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableSupplier" ADD CONSTRAINT "ConsumableSupplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableRequest" ADD CONSTRAINT "ConsumableRequest_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableRequest" ADD CONSTRAINT "ConsumableRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableRequest" ADD CONSTRAINT "ConsumableRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ConsumableSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableRequest" ADD CONSTRAINT "ConsumableRequest_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
