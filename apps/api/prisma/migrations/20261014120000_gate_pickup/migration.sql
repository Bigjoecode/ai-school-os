-- Gate check-in/out, parent arrival alerts and secure pick-up.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "gateSettings" JSONB;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "gateToken" TEXT;

-- AlterTable
ALTER TABLE "student_pickups" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EARLY',
ADD COLUMN     "verification" TEXT,
ADD COLUMN     "guardianId" TEXT,
ADD COLUMN     "authorisedPickupId" TEXT,
ADD COLUMN     "noticeId" TEXT,
ADD COLUMN     "overrideReason" TEXT;

-- CreateTable
CREATE TABLE "student_gate_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "gate" TEXT,
    "branchId" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "pickupId" TEXT,
    "recordedById" TEXT,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_gate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorised_pickups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "validUntil" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedBy" TEXT NOT NULL DEFAULT 'STAFF',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorised_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_notices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "eta" TEXT,
    "note" TEXT,
    "authorisedPickupId" TEXT,
    "delegateName" TEXT,
    "delegateRelationship" TEXT,
    "delegatePhone" TEXT,
    "delegatePhotoUrl" TEXT,
    "codeHash" TEXT,
    "codeSecret" TEXT,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codeUsedAt" TIMESTAMP(3),
    "codeSms" TEXT,
    "guardianId" TEXT,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_gateToken_key" ON "students"("gateToken");

-- CreateIndex
CREATE INDEX "student_gate_events_tenantId_date_idx" ON "student_gate_events"("tenantId", "date");

-- CreateIndex
CREATE INDEX "student_gate_events_studentId_date_idx" ON "student_gate_events"("studentId", "date");

-- CreateIndex
CREATE INDEX "authorised_pickups_tenantId_studentId_idx" ON "authorised_pickups"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "pickup_notices_tenantId_date_idx" ON "pickup_notices"("tenantId", "date");

-- CreateIndex
CREATE INDEX "pickup_notices_studentId_date_idx" ON "pickup_notices"("studentId", "date");

-- AddForeignKey
ALTER TABLE "student_gate_events" ADD CONSTRAINT "student_gate_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_gate_events" ADD CONSTRAINT "student_gate_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorised_pickups" ADD CONSTRAINT "authorised_pickups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorised_pickups" ADD CONSTRAINT "authorised_pickups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_notices" ADD CONSTRAINT "pickup_notices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_notices" ADD CONSTRAINT "pickup_notices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
