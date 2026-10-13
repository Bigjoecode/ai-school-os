-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "contactOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureIntro" TEXT,
ADD COLUMN     "featureList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "knownFeatures" TEXT[] DEFAULT ARRAY['ai', 'website', 'live_classes', 'messaging', 'online_payments', 'payroll', 'timetable', 'library', 'inventory', 'transport', 'hostel']::TEXT[],
ADD COLUMN     "minStudents" INTEGER,
ADD COLUMN     "setupFeeKobo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "smsUnitsPerStudent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainingDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "platform_invoices" ADD COLUMN     "lines" JSONB;

-- AlterTable
ALTER TABLE "tenant_billing" ADD COLUMN     "setupFeeKobo" INTEGER,
ADD COLUMN     "setupFeeMode" TEXT,
ADD COLUMN     "setupFeeNote" TEXT,
ADD COLUMN     "smsFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricing" TEXT NOT NULL DEFAULT 'FIXED',
    "priceKobo" INTEGER,
    "unitLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "operatorNote" TEXT,
    "amountKobo" INTEGER,
    "invoiceId" TEXT,
    "requestedById" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addon_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_enquiries" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "schoolName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "students" INTEGER NOT NULL,
    "branches" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "addons_code_key" ON "addons"("code");

-- CreateIndex
CREATE INDEX "addon_orders_tenantId_createdAt_idx" ON "addon_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "addon_orders_status_createdAt_idx" ON "addon_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "plan_enquiries_status_createdAt_idx" ON "plan_enquiries"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "addon_orders" ADD CONSTRAINT "addon_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_orders" ADD CONSTRAINT "addon_orders_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: schools that exist today never owe the new one-off setup fee (grandfathered).
INSERT INTO "platform_settings" ("key", "value", "updatedAt")
VALUES ('planPricing', jsonb_build_object('setupFeesFrom', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), now())
ON CONFLICT ("key") DO NOTHING;
