-- AlterTable
ALTER TABLE "online_exams" ADD COLUMN     "offlineCode" TEXT,
ADD COLUMN     "offlineEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offlineFrom" TIMESTAMP(3),
ADD COLUMN     "offlineSalt" TEXT,
ADD COLUMN     "offlineSyncBy" TIMESTAMP(3),
ADD COLUMN     "offlineVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "offline_exam_seats" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "hmacKey" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "packVersion" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "downloadedAt" TIMESTAMP(3),
    "downloadMode" TEXT,
    "downloadedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "submissionId" TEXT,
    "submission" JSONB,
    "elapsedSeconds" INTEGER,
    "clockSkewSeconds" INTEGER,
    "syncStatus" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flagsReviewedAt" TIMESTAMP(3),
    "flagsReviewedById" TEXT,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_exam_seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offline_exam_seats_tenantId_studentId_idx" ON "offline_exam_seats"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "offline_exam_seats_examId_studentId_key" ON "offline_exam_seats"("examId", "studentId");

-- AddForeignKey
ALTER TABLE "offline_exam_seats" ADD CONSTRAINT "offline_exam_seats_examId_fkey" FOREIGN KEY ("examId") REFERENCES "online_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
