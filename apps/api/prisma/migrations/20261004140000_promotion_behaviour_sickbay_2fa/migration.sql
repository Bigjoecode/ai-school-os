-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "chronicConditions" TEXT,
ADD COLUMN     "genotype" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "student_promotions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromSessionId" TEXT NOT NULL,
    "toSessionId" TEXT,
    "fromArmId" TEXT,
    "toArmId" TEXT,
    "decision" TEXT NOT NULL,
    "average" DOUBLE PRECISION,
    "note" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "actionTaken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "visibleToParents" BOOLEAN NOT NULL DEFAULT true,
    "parentNotifiedAt" TIMESTAMP(3),
    "reportedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behaviour_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sick_bay_visits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complaint" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "assessment" TEXT,
    "treatment" TEXT,
    "medication" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'RETURNED_TO_CLASS',
    "followUp" TEXT,
    "parentNotifiedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sick_bay_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_promotions_tenantId_fromSessionId_idx" ON "student_promotions"("tenantId", "fromSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "student_promotions_studentId_fromSessionId_key" ON "student_promotions"("studentId", "fromSessionId");

-- CreateIndex
CREATE INDEX "behaviour_records_tenantId_date_idx" ON "behaviour_records"("tenantId", "date");

-- CreateIndex
CREATE INDEX "behaviour_records_studentId_idx" ON "behaviour_records"("studentId");

-- CreateIndex
CREATE INDEX "sick_bay_visits_tenantId_visitedAt_idx" ON "sick_bay_visits"("tenantId", "visitedAt");

-- CreateIndex
CREATE INDEX "sick_bay_visits_studentId_idx" ON "sick_bay_visits"("studentId");

-- AddForeignKey
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_records" ADD CONSTRAINT "behaviour_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
