-- AlterTable
ALTER TABLE "guardians" ADD COLUMN "smsOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "parent_line_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "channel" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sessionId" TEXT,
    "input" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "guardianId" TEXT,
    "studentId" TEXT,
    "smsUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_line_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_line_requests_phone_createdAt_idx" ON "parent_line_requests"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "parent_line_requests_tenantId_createdAt_idx" ON "parent_line_requests"("tenantId", "createdAt");

-- Find a caller's guardian records by the last ten digits of the phone, whatever format it was typed in (0803…, +234 803…).
CREATE INDEX "guardians_phone_last10_idx" ON "guardians"(right(regexp_replace("phone", '[^0-9]', '', 'g'), 10));
