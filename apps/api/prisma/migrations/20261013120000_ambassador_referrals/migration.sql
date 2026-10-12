-- AlterTable
ALTER TABLE "school_signups" ADD COLUMN     "ambassadorId" TEXT,
ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "ambassadors" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codesSent" INTEGER NOT NULL DEFAULT 0,
    "codePurpose" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "pendingBank" JSONB,
    "ip" TEXT,
    "referralCode" TEXT,
    "codeChangedAt" TIMESTAMP(3),
    "userId" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassadors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_referrals" (
    "tenantId" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "signupId" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_referrals_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ambassador_commissions" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMISSION',
    "paymentId" TEXT,
    "refundId" TEXT,
    "reversesId" TEXT,
    "baseKobo" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payableAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassador_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambassador_payouts" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "commissionCount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ambassador_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambassador_notices" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ambassador_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ambassadors_referralCode_key" ON "ambassadors"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "ambassadors_userId_key" ON "ambassadors"("userId");

-- CreateIndex
CREATE INDEX "ambassadors_status_createdAt_idx" ON "ambassadors"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ambassadors_email_idx" ON "ambassadors"("email");

-- CreateIndex
CREATE INDEX "ambassadors_phone_idx" ON "ambassadors"("phone");

-- CreateIndex
CREATE INDEX "tenant_referrals_ambassadorId_idx" ON "tenant_referrals"("ambassadorId");

-- CreateIndex
CREATE UNIQUE INDEX "ambassador_commissions_paymentId_key" ON "ambassador_commissions"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ambassador_commissions_refundId_key" ON "ambassador_commissions"("refundId");

-- CreateIndex
CREATE INDEX "ambassador_commissions_ambassadorId_status_idx" ON "ambassador_commissions"("ambassadorId", "status");

-- CreateIndex
CREATE INDEX "ambassador_commissions_status_payableAt_idx" ON "ambassador_commissions"("status", "payableAt");

-- CreateIndex
CREATE INDEX "ambassador_commissions_tenantId_idx" ON "ambassador_commissions"("tenantId");

-- CreateIndex
CREATE INDEX "ambassador_payouts_ambassadorId_createdAt_idx" ON "ambassador_payouts"("ambassadorId", "createdAt");

-- CreateIndex
CREATE INDEX "ambassador_notices_ambassadorId_createdAt_idx" ON "ambassador_notices"("ambassadorId", "createdAt");

-- AddForeignKey
ALTER TABLE "tenant_referrals" ADD CONSTRAINT "tenant_referrals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_referrals" ADD CONSTRAINT "tenant_referrals_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ambassador_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_payouts" ADD CONSTRAINT "ambassador_payouts_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_notices" ADD CONSTRAINT "ambassador_notices_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "ambassadors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
