-- AlterTable
ALTER TABLE "tenant_integrations" ADD COLUMN     "config" JSONB;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "commsSettings" JSONB;

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channels" TEXT[],
    "audience" JSONB NOT NULL,
    "audienceSummary" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "smsBody" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "address" TEXT,
    "guardianId" TEXT,
    "staffId" TEXT,
    "userId" TEXT,
    "subject" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "providerRef" TEXT,
    "units" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'EVERYONE',
    "classArmIds" TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "broadcastId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "startTime" TEXT,
    "endDate" DATE,
    "endTime" TEXT,
    "location" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'EVERYONE',
    "classArmIds" TEXT[],
    "remindDaysBefore" INTEGER,
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "broadcastId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_tenantId_createdAt_idx" ON "broadcasts"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduledAt_idx" ON "broadcasts"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "deliveries_broadcastId_idx" ON "deliveries"("broadcastId");

-- CreateIndex
CREATE INDEX "deliveries_status_createdAt_idx" ON "deliveries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "deliveries_tenantId_sentAt_idx" ON "deliveries"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "announcements_tenantId_publishAt_idx" ON "announcements"("tenantId", "publishAt");

-- CreateIndex
CREATE INDEX "school_events_tenantId_startDate_idx" ON "school_events"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_tenantId_kind_subjectKey_runDate_key" ON "automation_runs"("tenantId", "kind", "subjectKey", "runDate");

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant the new communication permissions to existing schools' built-in roles.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['comms.read','comms.send','comms.manage','announcements.manage','events.manage'])) WHERE "isSystem" AND "key" IN ('school_admin','principal');
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['comms.read','comms.send','announcements.manage','events.manage'])) WHERE "isSystem" AND "key" = 'vice_principal';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['comms.read','events.manage'])) WHERE "isSystem" AND "key" = 'academic_coordinator';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['comms.read'])) WHERE "isSystem" AND "key" IN ('teacher','librarian');
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['comms.read','comms.send'])) WHERE "isSystem" AND "key" IN ('accountant','hr_manager','receptionist','transport_manager','hostel_manager');
