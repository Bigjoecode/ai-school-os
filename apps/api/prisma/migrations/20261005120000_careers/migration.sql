-- CreateTable
CREATE TABLE "careers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "dayToDay" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tracks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "courses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otherRoutes" TEXT,
    "professionalBodies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outlook" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faculty" TEXT,
    "utmeSubjects" JSONB NOT NULL DEFAULT '[]',
    "olevelRequirements" JSONB,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceEdition" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "interestScores" JSONB,
    "quizAnswers" JSONB,
    "quizCompletedAt" TIMESTAMP(3),
    "savedCareers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCourse" TEXT,
    "plannedTrack" TEXT,
    "counsellorNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "careers_slug_key" ON "careers"("slug");

-- CreateIndex
CREATE INDEX "careers_field_idx" ON "careers"("field");

-- CreateIndex
CREATE UNIQUE INDEX "university_courses_name_key" ON "university_courses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "career_profiles_studentId_key" ON "career_profiles"("studentId");

-- CreateIndex
CREATE INDEX "career_profiles_tenantId_idx" ON "career_profiles"("tenantId");

-- AddForeignKey
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
