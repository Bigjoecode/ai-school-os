-- CreateTable
CREATE TABLE "learning_modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "subjectId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "classArmId" TEXT,
    "topicId" TEXT,
    "topicName" TEXT,
    "termId" TEXT,
    "week" INTEGER,
    "schemeWeekId" TEXT,
    "lessonPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mustPass" BOOLEAN NOT NULL DEFAULT true,
    "passMark" INTEGER NOT NULL DEFAULT 60,
    "library" BOOLEAN NOT NULL DEFAULT false,
    "copiedFromId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_module_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "fileId" TEXT,
    "mimeType" TEXT,
    "url" TEXT,
    "materialId" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "passMark" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_module_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_progress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedStepIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentStepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "mode" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "teacherUserId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "currentStepId" TEXT,
    "openStepId" TEXT,
    "openedAt" TIMESTAMP(3),
    "present" INTEGER,
    "results" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "classroom_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_modules_tenantId_classArmId_subjectId_idx" ON "learning_modules"("tenantId", "classArmId", "subjectId");

-- CreateIndex
CREATE INDEX "learning_modules_tenantId_library_subjectId_idx" ON "learning_modules"("tenantId", "library", "subjectId");

-- CreateIndex
CREATE INDEX "learning_module_steps_moduleId_order_idx" ON "learning_module_steps"("moduleId", "order");

-- CreateIndex
CREATE INDEX "module_progress_tenantId_studentId_idx" ON "module_progress"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "module_progress_moduleId_studentId_key" ON "module_progress"("moduleId", "studentId");

-- CreateIndex
CREATE INDEX "check_in_attempts_moduleId_studentId_idx" ON "check_in_attempts"("moduleId", "studentId");

-- CreateIndex
CREATE INDEX "check_in_attempts_sessionId_stepId_idx" ON "check_in_attempts"("sessionId", "stepId");

-- CreateIndex
CREATE INDEX "check_in_attempts_tenantId_createdAt_idx" ON "check_in_attempts"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "classroom_sessions_tenantId_startedAt_idx" ON "classroom_sessions"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "classroom_sessions_tenantId_code_status_idx" ON "classroom_sessions"("tenantId", "code", "status");

-- AddForeignKey
ALTER TABLE "learning_module_steps" ADD CONSTRAINT "learning_module_steps_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_attempts" ADD CONSTRAINT "check_in_attempts_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
