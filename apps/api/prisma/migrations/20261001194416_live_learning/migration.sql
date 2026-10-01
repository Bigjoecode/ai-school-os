-- CreateTable
CREATE TABLE "live_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "lessonPlanId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "agenda" TEXT,
    "joinUrl" TEXT,
    "externalId" TEXT,
    "providerData" JSONB,
    "transcript" TEXT,
    "transcriptSource" TEXT,
    "teacherNotes" TEXT,
    "intelligence" JSONB,
    "intelligenceJobId" TEXT,
    "homeworkId" TEXT,
    "quizQuestionIds" TEXT[],
    "syncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_recordings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "liveClassId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "questions" TEXT[],
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_classes_tenantId_startsAt_idx" ON "live_classes"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "live_classes_classArmId_startsAt_idx" ON "live_classes"("classArmId", "startsAt");

-- CreateIndex
CREATE INDEX "live_attendance_tenantId_idx" ON "live_attendance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "live_attendance_liveClassId_studentId_key" ON "live_attendance"("liveClassId", "studentId");

-- CreateIndex
CREATE INDEX "live_recordings_tenantId_idx" ON "live_recordings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "live_recordings_liveClassId_externalId_key" ON "live_recordings"("liveClassId", "externalId");

-- CreateIndex
CREATE INDEX "homework_tenantId_classArmId_dueDate_idx" ON "homework"("tenantId", "classArmId", "dueDate");

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "class_arms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "lesson_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_recordings" ADD CONSTRAINT "live_recordings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_recordings" ADD CONSTRAINT "live_recordings_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "class_arms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grant the new live-learning permissions to existing schools' built-in roles.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['live.read','live.host','live.manage','homework.manage'])) WHERE "isSystem" AND "key" = 'school_admin';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['live.read','live.manage','homework.manage'])) WHERE "isSystem" AND "key" IN ('principal','vice_principal','academic_coordinator');
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['live.read','live.host','homework.manage'])) WHERE "isSystem" AND "key" = 'teacher';
