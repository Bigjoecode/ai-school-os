-- WAEC Practical Academy: lessons (platform content) and students' virtual-lab attempts and quick checks.

-- CreateTable
CREATE TABLE "practical_lessons" (
    "id" TEXT NOT NULL,
    "exam" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicId" TEXT,
    "topicName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "simulator" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "file" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practical_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "practicalId" TEXT NOT NULL,
    "simulatorId" TEXT,
    "seed" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "scores" JSONB,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "aiFeedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "override" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "practical_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practical_lessons_exam_subject_idx" ON "practical_lessons"("exam", "subject");

-- CreateIndex
CREATE INDEX "practical_attempts_studentId_startedAt_idx" ON "practical_attempts"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "practical_attempts_tenantId_startedAt_idx" ON "practical_attempts"("tenantId", "startedAt");

-- AddForeignKey
ALTER TABLE "practical_lessons" ADD CONSTRAINT "practical_lessons_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "syllabus_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_attempts" ADD CONSTRAINT "practical_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_attempts" ADD CONSTRAINT "practical_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
