-- CreateTable
CREATE TABLE "result_pin_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'PRINT',
    "sessionId" TEXT NOT NULL,
    "termId" TEXT,
    "count" INTEGER NOT NULL,
    "usesPerPin" INTEGER NOT NULL DEFAULT 5,
    "priceKobo" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requireSale" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "exportedAt" TIMESTAMP(3),
    "exportedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_pin_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_pins" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "sealed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNSOLD',
    "soldAt" TIMESTAMP(3),
    "soldVia" TEXT,
    "soldById" TEXT,
    "soldTo" TEXT,
    "studentId" TEXT,
    "boundAt" TIMESTAMP(3),
    "usesLeft" INTEGER NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_pin_uses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "ipHash" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_pin_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_pin_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "pinId" TEXT,
    "reference" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "buyerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimHash" TEXT NOT NULL,
    "sealed" TEXT,
    "delivery" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_pin_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_pin_batches_tenantId_number_key" ON "result_pin_batches"("tenantId", "number");

-- CreateIndex
CREATE INDEX "result_pins_batchId_status_idx" ON "result_pins"("batchId", "status");

-- CreateIndex
CREATE INDEX "result_pins_studentId_idx" ON "result_pins"("studentId");

-- CreateIndex
CREATE INDEX "result_pins_tenantId_last4_idx" ON "result_pins"("tenantId", "last4");

-- CreateIndex
CREATE UNIQUE INDEX "result_pins_tenantId_serial_key" ON "result_pins"("tenantId", "serial");

-- CreateIndex
CREATE INDEX "result_pin_uses_tenantId_createdAt_idx" ON "result_pin_uses"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "result_pin_uses_pinId_idx" ON "result_pin_uses"("pinId");

-- CreateIndex
CREATE INDEX "result_pin_uses_studentId_termId_idx" ON "result_pin_uses"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "result_pin_sales_pinId_key" ON "result_pin_sales"("pinId");

-- CreateIndex
CREATE UNIQUE INDEX "result_pin_sales_reference_key" ON "result_pin_sales"("reference");

-- CreateIndex
CREATE INDEX "result_pin_sales_tenantId_createdAt_idx" ON "result_pin_sales"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "result_pin_batches" ADD CONSTRAINT "result_pin_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pins" ADD CONSTRAINT "result_pins_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pins" ADD CONSTRAINT "result_pins_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "result_pin_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pins" ADD CONSTRAINT "result_pins_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_uses" ADD CONSTRAINT "result_pin_uses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_uses" ADD CONSTRAINT "result_pin_uses_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "result_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_uses" ADD CONSTRAINT "result_pin_uses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_sales" ADD CONSTRAINT "result_pin_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_sales" ADD CONSTRAINT "result_pin_sales_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "result_pin_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_pin_sales" ADD CONSTRAINT "result_pin_sales_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "result_pins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
