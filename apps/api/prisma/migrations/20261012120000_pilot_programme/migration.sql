-- AlterTable
ALTER TABLE "school_signups" ADD COLUMN     "pilot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pilotReason" TEXT;

-- AlterTable
ALTER TABLE "tenant_billing" ADD COLUMN     "pilotEndsAt" TIMESTAMP(3),
ADD COLUMN     "pilotStartedAt" TIMESTAMP(3),
ADD COLUMN     "pilotStatus" TEXT;

-- CreateIndex
CREATE INDEX "tenant_billing_pilotStatus_idx" ON "tenant_billing"("pilotStatus");
