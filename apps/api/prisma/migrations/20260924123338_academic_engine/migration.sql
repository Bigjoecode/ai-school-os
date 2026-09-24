-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "GenerationState" AS ENUM ('NONE', 'QUEUED', 'RUNNING', 'FAILED', 'DONE');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'READY', 'DELIVERED');

-- CreateTable
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ContentSource" NOT NULL DEFAULT 'MANUAL',
    "generation" "GenerationState" NOT NULL DEFAULT 'NONE',
    "generationError" TEXT,
    "guidance" TEXT,
    "weeksPerTerm" INTEGER NOT NULL DEFAULT 11,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "termOrder" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "subtopics" TEXT[],
    "objectives" TEXT[],
    "activities" TEXT[],
    "resources" TEXT[],
    "assessment" TEXT[],

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schemes_of_work" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ContentSource" NOT NULL DEFAULT 'MANUAL',
    "generation" "GenerationState" NOT NULL DEFAULT 'NONE',
    "generationError" TEXT,
    "guidance" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schemes_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_weeks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "startsOn" DATE,
    "topic" TEXT NOT NULL,
    "subtopics" TEXT[],
    "objectives" TEXT[],
    "activities" TEXT[],
    "resources" TEXT[],
    "evaluation" TEXT[],

    CONSTRAINT "scheme_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "schemeWeekId" TEXT,
    "teacherId" TEXT,
    "createdById" TEXT,
    "topic" TEXT NOT NULL,
    "date" DATE,
    "durationMinutes" INTEGER NOT NULL DEFAULT 40,
    "objectives" TEXT[],
    "priorKnowledge" TEXT,
    "materials" TEXT[],
    "steps" JSONB NOT NULL DEFAULT '[]',
    "differentiation" JSONB,
    "assessment" TEXT[],
    "homework" TEXT,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ContentSource" NOT NULL DEFAULT 'MANUAL',
    "generation" "GenerationState" NOT NULL DEFAULT 'NONE',
    "generationError" TEXT,
    "guidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curricula_tenantId_idx" ON "curricula"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_subjectId_classLevelId_version_key" ON "curricula"("subjectId", "classLevelId", "version");

-- CreateIndex
CREATE INDEX "curriculum_units_tenantId_idx" ON "curriculum_units"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_curriculumId_termOrder_week_key" ON "curriculum_units"("curriculumId", "termOrder", "week");

-- CreateIndex
CREATE INDEX "schemes_of_work_tenantId_idx" ON "schemes_of_work"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "schemes_of_work_subjectId_classLevelId_termId_key" ON "schemes_of_work"("subjectId", "classLevelId", "termId");

-- CreateIndex
CREATE INDEX "scheme_weeks_tenantId_idx" ON "scheme_weeks"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_weeks_schemeId_week_key" ON "scheme_weeks"("schemeId", "week");

-- CreateIndex
CREATE INDEX "lesson_plans_tenantId_classArmId_date_idx" ON "lesson_plans"("tenantId", "classArmId", "date");

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_weeks" ADD CONSTRAINT "scheme_weeks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_weeks" ADD CONSTRAINT "scheme_weeks_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "schemes_of_work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "class_arms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_schemeWeekId_fkey" FOREIGN KEY ("schemeWeekId") REFERENCES "scheme_weeks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grant the new academic-engine permissions to existing schools' built-in
-- roles (new schools get them from SYSTEM_ROLES).
UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['curriculum.read', 'curriculum.manage', 'lessons.read', 'lessons.manage']))
 WHERE "isSystem" AND "key" IN ('school_admin', 'principal', 'vice_principal', 'academic_coordinator');

UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['curriculum.read', 'lessons.read', 'lessons.manage']))
 WHERE "isSystem" AND "key" = 'teacher';
