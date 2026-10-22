-- Full WASSCE mock: one sitting per subject, each paper a practice attempt on its own clock.

-- AlterTable
ALTER TABLE "practice_attempts" ADD COLUMN "sittingId" TEXT,
ADD COLUMN "paper" INTEGER;

-- CreateTable
CREATE TABLE "exam_sittings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "exam" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "result" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "exam_sittings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_sittings_studentId_startedAt_idx" ON "exam_sittings"("studentId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "practice_attempts_sittingId_paper_key" ON "practice_attempts"("sittingId", "paper");

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_sittingId_fkey" FOREIGN KEY ("sittingId") REFERENCES "exam_sittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sittings" ADD CONSTRAINT "exam_sittings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sittings" ADD CONSTRAINT "exam_sittings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
