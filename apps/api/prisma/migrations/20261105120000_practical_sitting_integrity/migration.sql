-- Exam integrity for sittings of practical tests, as for online exams (additive).
ALTER TABLE "practical_attempts" ADD COLUMN "focusLosses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "practical_attempts" ADD COLUMN "ip" TEXT;
ALTER TABLE "practical_attempts" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
