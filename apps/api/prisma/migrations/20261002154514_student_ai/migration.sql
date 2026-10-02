-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "studentId" TEXT;

-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "aiTier" TEXT,
ADD COLUMN     "studentId" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "studentAiSessions" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "platform_invoices" ADD COLUMN     "domain" TEXT NOT NULL DEFAULT 'SCHOOL';

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "entitlements" TEXT[],
    "priceKobo" INTEGER NOT NULL,
    "schoolPriceKobo" INTEGER,
    "period" TEXT NOT NULL DEFAULT 'TERM',
    "periodMonths" INTEGER NOT NULL DEFAULT 4,
    "maxChildren" INTEGER NOT NULL DEFAULT 1,
    "aiSessions" INTEGER,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER,
    "amountOffKobo" INTEGER,
    "productCodes" TEXT[],
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceKobo" INTEGER NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "authorizationEnc" TEXT,
    "cardHint" TEXT,
    "email" TEXT NOT NULL,
    "couponCode" TEXT,
    "renewalAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastRenewalAttempt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_subscription_students" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "consumer_subscription_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NEW',
    "studentIds" TEXT[],
    "amountKobo" INTEGER NOT NULL,
    "discountKobo" INTEGER NOT NULL DEFAULT 0,
    "feeKobo" INTEGER,
    "couponCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "refundedKobo" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classArmIds" TEXT[],
    "seats" INTEGER NOT NULL,
    "unitKobo" INTEGER NOT NULL,
    "totalKobo" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "platformInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_entitlements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "consumerSubscriptionId" TEXT,
    "sponsorshipId" TEXT,
    "productId" TEXT,
    "aiSessions" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_ai_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "deepUnits" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_memories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "evidence" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_topics" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "syllabus_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "lastEvidenceAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_decks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "cards" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcard_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "exam" TEXT,
    "subject" TEXT,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "score" INTEGER,
    "total" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "perTopic" JSONB,
    "review" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "exam" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicId" TEXT,
    "year" INTEGER,
    "stem" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answer" INTEGER NOT NULL,
    "explanation" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL DEFAULT 'AUTHORED',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'PARENTS',
    "fileId" TEXT,
    "filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "chars" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_chunks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "debitKobo" INTEGER NOT NULL DEFAULT 0,
    "creditKobo" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "domain" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "memo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "consumer_subscriptions_userId_idx" ON "consumer_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "consumer_subscriptions_status_currentPeriodEnd_idx" ON "consumer_subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "consumer_subscription_students_studentId_idx" ON "consumer_subscription_students"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_subscription_students_subscriptionId_studentId_key" ON "consumer_subscription_students"("subscriptionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_orders_reference_key" ON "consumer_orders"("reference");

-- CreateIndex
CREATE INDEX "consumer_orders_userId_createdAt_idx" ON "consumer_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "consumer_orders_status_idx" ON "consumer_orders"("status");

-- CreateIndex
CREATE INDEX "sponsorships_tenantId_idx" ON "sponsorships"("tenantId");

-- CreateIndex
CREATE INDEX "student_entitlements_studentId_status_endsAt_idx" ON "student_entitlements"("studentId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "student_entitlements_consumerSubscriptionId_idx" ON "student_entitlements"("consumerSubscriptionId");

-- CreateIndex
CREATE INDEX "student_entitlements_sponsorshipId_idx" ON "student_entitlements"("sponsorshipId");

-- CreateIndex
CREATE UNIQUE INDEX "student_ai_usage_studentId_periodKey_key" ON "student_ai_usage"("studentId", "periodKey");

-- CreateIndex
CREATE INDEX "student_memories_studentId_active_idx" ON "student_memories"("studentId", "active");

-- CreateIndex
CREATE INDEX "syllabus_topics_subject_idx" ON "syllabus_topics"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_topics_subject_level_name_key" ON "syllabus_topics"("subject", "level", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_records_studentId_topicId_key" ON "mastery_records"("studentId", "topicId");

-- CreateIndex
CREATE INDEX "study_plans_studentId_status_idx" ON "study_plans"("studentId", "status");

-- CreateIndex
CREATE INDEX "flashcard_decks_studentId_idx" ON "flashcard_decks"("studentId");

-- CreateIndex
CREATE INDEX "practice_attempts_studentId_startedAt_idx" ON "practice_attempts"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "exam_questions_exam_subject_status_idx" ON "exam_questions"("exam", "subject", "status");

-- CreateIndex
CREATE INDEX "kb_documents_tenantId_idx" ON "kb_documents"("tenantId");

-- CreateIndex
CREATE INDEX "kb_chunks_tenantId_documentId_idx" ON "kb_chunks"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "ledger_entries_txnId_idx" ON "ledger_entries"("txnId");

-- CreateIndex
CREATE INDEX "ledger_entries_account_createdAt_idx" ON "ledger_entries"("account", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "refunds_sourceType_sourceId_idx" ON "refunds"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "consumer_subscriptions" ADD CONSTRAINT "consumer_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_subscriptions" ADD CONSTRAINT "consumer_subscriptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_subscription_students" ADD CONSTRAINT "consumer_subscription_students_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "consumer_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_subscription_students" ADD CONSTRAINT "consumer_subscription_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_subscription_students" ADD CONSTRAINT "consumer_subscription_students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_orders" ADD CONSTRAINT "consumer_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_orders" ADD CONSTRAINT "consumer_orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_orders" ADD CONSTRAINT "consumer_orders_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "consumer_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_entitlements" ADD CONSTRAINT "student_entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_entitlements" ADD CONSTRAINT "student_entitlements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_ai_usage" ADD CONSTRAINT "student_ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_ai_usage" ADD CONSTRAINT "student_ai_usage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_memories" ADD CONSTRAINT "student_memories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_memories" ADD CONSTRAINT "student_memories_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_topics" ADD CONSTRAINT "syllabus_topics_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "syllabus_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "syllabus_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "syllabus_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "kb_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New permissions for existing schools' system roles.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['learning.use', 'family.manage', 'sponsorship.manage', 'knowledge.manage']))
WHERE "isSystem" AND "key" = 'school_admin';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['sponsorship.manage', 'knowledge.manage']))
WHERE "isSystem" AND "key" = 'principal';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['sponsorship.manage']))
WHERE "isSystem" AND "key" = 'accountant';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['family.manage']))
WHERE "isSystem" AND "key" = 'parent';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['learning.use']))
WHERE "isSystem" AND "key" = 'student';
