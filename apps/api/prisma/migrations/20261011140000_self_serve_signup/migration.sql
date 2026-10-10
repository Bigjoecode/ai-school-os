-- CreateTable
CREATE TABLE "school_signups" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "schoolName" TEXT NOT NULL,
    "schoolType" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "approxStudents" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "planId" TEXT,
    "adminFirstName" TEXT NOT NULL,
    "adminLastName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminPhone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codesSent" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing" (
    "tenantId" TEXT NOT NULL,
    "enforced" BOOLEAN,
    "selfServe" BOOLEAN NOT NULL DEFAULT false,
    "cycle" TEXT NOT NULL DEFAULT 'TERM',
    "pendingPlanId" TEXT,
    "peakStudents" INTEGER NOT NULL DEFAULT 0,
    "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "school_signups_status_createdAt_idx" ON "school_signups"("status", "createdAt");

-- CreateIndex
CREATE INDEX "school_signups_adminEmail_createdAt_idx" ON "school_signups"("adminEmail", "createdAt");

-- CreateIndex
CREATE INDEX "school_signups_slug_idx" ON "school_signups"("slug");

-- AddForeignKey
ALTER TABLE "tenant_billing" ADD CONSTRAINT "tenant_billing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
