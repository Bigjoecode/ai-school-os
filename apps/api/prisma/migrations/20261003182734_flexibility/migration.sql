-- AlterEnum
ALTER TYPE "ContentSource" ADD VALUE 'UPLOAD';

-- AlterTable
ALTER TABLE "curricula" ADD COLUMN     "importFileId" TEXT,
ADD COLUMN     "importText" TEXT;

-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN     "markingGuide" TEXT,
ADD COLUMN     "marks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'OBJECTIVE';

-- AlterTable
ALTER TABLE "homework" ADD COLUMN     "allowLate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'QUESTIONS',
ADD COLUMN     "markingGuide" TEXT,
ADD COLUMN     "maxScore" INTEGER,
ADD COLUMN     "submissionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "schemes_of_work" ADD COLUMN     "importFileId" TEXT,
ADD COLUMN     "importText" TEXT;

-- AlterTable
ALTER TABLE "syllabus_topics" ADD COLUMN     "content" TEXT,
ADD COLUMN     "exams" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "report_card_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "sampleFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_trait_ratings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "trait" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_trait_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "text" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "aiSuggestion" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_card_templates_tenantId_idx" ON "report_card_templates"("tenantId");

-- CreateIndex
CREATE INDEX "student_trait_ratings_tenantId_termId_idx" ON "student_trait_ratings"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "student_trait_ratings_studentId_termId_domain_trait_key" ON "student_trait_ratings"("studentId", "termId", "domain", "trait");

-- CreateIndex
CREATE INDEX "homework_submissions_tenantId_homeworkId_idx" ON "homework_submissions"("tenantId", "homeworkId");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homeworkId_studentId_key" ON "homework_submissions"("homeworkId", "studentId");

-- AddForeignKey
ALTER TABLE "report_card_templates" ADD CONSTRAINT "report_card_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_trait_ratings" ADD CONSTRAINT "student_trait_ratings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_trait_ratings" ADD CONSTRAINT "student_trait_ratings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
