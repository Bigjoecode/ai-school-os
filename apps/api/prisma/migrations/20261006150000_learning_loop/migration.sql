-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "learningUpdatesOff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "homework" ADD COLUMN     "topicId" TEXT;

-- CreateTable
CREATE TABLE "mastery_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "correct" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "scoreAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_updates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "content" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RULES',
    "sentAt" TIMESTAMP(3),
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mastery_evidence_studentId_createdAt_idx" ON "mastery_evidence"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "mastery_evidence_tenantId_topicId_idx" ON "mastery_evidence"("tenantId", "topicId");

-- CreateIndex
CREATE INDEX "learning_updates_tenantId_weekStart_idx" ON "learning_updates"("tenantId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "learning_updates_studentId_weekStart_key" ON "learning_updates"("studentId", "weekStart");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "syllabus_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "syllabus_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
