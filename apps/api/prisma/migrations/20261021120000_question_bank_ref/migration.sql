-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN "bankRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_bankRef_key" ON "exam_questions"("bankRef");
