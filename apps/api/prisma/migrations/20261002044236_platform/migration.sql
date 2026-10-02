-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "ai_usage" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxStudents" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priceOverrideKobo" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "description" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "seats" INTEGER NOT NULL DEFAULT 0,
    "unitKobo" INTEGER NOT NULL DEFAULT 0,
    "discountKobo" INTEGER NOT NULL DEFAULT 0,
    "amountKobo" INTEGER NOT NULL,
    "paidKobo" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reference" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'BETA',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_daily" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "clientErrors" INTEGER NOT NULL DEFAULT 0,
    "serverErrors" INTEGER NOT NULL DEFAULT 0,
    "totalMs" BIGINT NOT NULL DEFAULT 0,
    "maxMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openedById" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awaitingPlatform" BOOLEAN NOT NULL DEFAULT true,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromPlatform" BOOLEAN NOT NULL DEFAULT false,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_tenantId_issuedAt_idx" ON "platform_invoices"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "platform_invoices_status_dueDate_idx" ON "platform_invoices"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_subscriptionId_periodStart_key" ON "platform_invoices"("subscriptionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "platform_payments_reference_key" ON "platform_payments"("reference");

-- CreateIndex
CREATE INDEX "platform_payments_tenantId_createdAt_idx" ON "platform_payments"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenantId_flagKey_key" ON "tenant_features"("tenantId", "flagKey");

-- CreateIndex
CREATE INDEX "api_usage_daily_day_idx" ON "api_usage_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_daily_scope_day_key" ON "api_usage_daily"("scope", "day");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_status_idx" ON "support_tickets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_status_lastMessageAt_idx" ON "support_tickets"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "platform_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "feature_flags"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Module flags: one per module a plan can include (packages/shared MODULE_FEATURES).
INSERT INTO "feature_flags" ("id", "key", "name", "description", "kind", "enabled", "rolloutPercent", "updatedAt") VALUES
  (md5(random()::text || clock_timestamp()::text), 'ai', 'AI assistants and generators', 'Every AI feature: assistants, lesson and exam generators, briefings and the website assistant.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'website', 'School website', 'Public website, news, gallery, results checker and online applications.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'live_classes', 'Live classes', 'Google Meet, Zoom and BigBlueButton classes with AI class packs.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'messaging', 'Messages', 'Email, SMS and WhatsApp messages to parents and staff.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'online_payments', 'Online fee payments', 'Parents pay fees online through the school''s Paystack account.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'payroll', 'Payroll', 'Salary grades, monthly payroll, payslips and bank schedules.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'timetable', 'Smart timetable', 'Timetable builder and solver.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'library', 'Library', 'Catalogue, loans and fines.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'inventory', 'Inventory', 'Stores, assets and stock counts.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'transport', 'Transport', 'Vehicles, routes and riders.', 'MODULE', true, 0, NOW()),
  (md5(random()::text || clock_timestamp()::text), 'hostel', 'Hostel', 'Boarding houses, beds and exeats.', 'MODULE', true, 0, NOW())
ON CONFLICT ("key") DO NOTHING;

-- Older plans listed marketing labels as features; an empty list means every module.
UPDATE "plans" SET "features" = '{}' WHERE NOT ("features" && ARRAY['ai','website','live_classes','messaging','online_payments','payroll','timetable','library','inventory','transport','hostel']);

-- Schools on a plan without a subscription start one as a trial.
INSERT INTO "subscriptions" ("id", "tenantId", "planId", "status", "studentSeats", "currentPeriodStart", "currentPeriodEnd", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), t."id", t."planId", 'TRIALING', 0, t."createdAt", COALESCE(t."trialEndsAt", t."createdAt" + INTERVAL '30 days'), NOW()
FROM "tenants" t
WHERE t."planId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."tenantId" = t."id");

-- New permissions for existing schools' system roles.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['billing.manage', 'support.use']))
WHERE "isSystem" AND "key" IN ('school_admin', 'accountant');
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['support.use']))
WHERE "isSystem" AND "key" = 'principal';
