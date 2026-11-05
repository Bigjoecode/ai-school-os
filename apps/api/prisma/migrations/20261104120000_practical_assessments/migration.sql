-- Practical assessments: a teacher schedules a Practical Academy virtual lab as a timed class test or exam for class arms; each student's sitting is a PracticalAttempt linked to it (one per student).

-- AlterTable
ALTER TABLE "practical_attempts" ADD COLUMN     "assessmentId" TEXT;

-- CreateTable
CREATE TABLE "practical_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "practicalId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXAM',
    "classArmIds" TEXT[],
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "accessCode" TEXT,
    "showResults" TEXT NOT NULL DEFAULT 'AFTER_CLOSE',
    "componentKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "resultsReleasedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practical_assessments_tenantId_opensAt_idx" ON "practical_assessments"("tenantId", "opensAt");

-- CreateIndex
CREATE INDEX "practical_attempts_submittedAt_endsAt_idx" ON "practical_attempts"("submittedAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "practical_attempts_assessmentId_studentId_key" ON "practical_attempts"("assessmentId", "studentId");

-- AddForeignKey
ALTER TABLE "practical_attempts" ADD CONSTRAINT "practical_attempts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "practical_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessments" ADD CONSTRAINT "practical_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

