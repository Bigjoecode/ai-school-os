-- CreateTable
CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "enquiryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "source" TEXT NOT NULL DEFAULT 'FRONT_DESK',
    "childFirstName" TEXT NOT NULL,
    "childMiddleName" TEXT,
    "childLastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "classLevelId" TEXT,
    "entryTerm" TEXT,
    "previousSchool" TEXT,
    "parentName" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "parentEmail" TEXT,
    "relationship" TEXT,
    "address" TEXT,
    "medicalNotes" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "examAt" TIMESTAMP(3),
    "examVenue" TEXT,
    "examScore" DOUBLE PRECISION,
    "interviewAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "offerExpiresOn" DATE,
    "applicationFeeKobo" INTEGER,
    "feePaidAt" TIMESTAMP(3),
    "feeReference" TEXT,
    "studentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "subjectId" TEXT,
    "classLevelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "classArmIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "termId" TEXT,
    "topic" TEXT,
    "fileId" TEXT,
    "url" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "body" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_exams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classArmIds" TEXT[],
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "showResults" TEXT NOT NULL DEFAULT 'AFTER_CLOSE',
    "sendToScores" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "accessCode" TEXT,
    "resultsReleasedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_exam_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "objectiveScore" DOUBLE PRECISION,
    "theoryMarks" JSONB NOT NULL DEFAULT '{}',
    "score" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "focusLosses" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admission_applications_tenantId_status_idx" ON "admission_applications"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_tenantId_number_key" ON "admission_applications"("tenantId", "number");

-- CreateIndex
CREATE INDEX "study_materials_tenantId_subjectId_idx" ON "study_materials"("tenantId", "subjectId");

-- CreateIndex
CREATE INDEX "online_exams_tenantId_opensAt_idx" ON "online_exams"("tenantId", "opensAt");

-- CreateIndex
CREATE INDEX "online_exam_attempts_tenantId_studentId_idx" ON "online_exam_attempts"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "online_exam_attempts_examId_studentId_key" ON "online_exam_attempts"("examId", "studentId");

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exam_attempts" ADD CONSTRAINT "online_exam_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exam_attempts" ADD CONSTRAINT "online_exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "online_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
