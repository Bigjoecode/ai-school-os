-- Homework can assign a Practical Academy lesson (kind PRACTICAL): the student's lab or quick check hands it in.

-- AlterTable
ALTER TABLE "homework" ADD COLUMN "practicalId" TEXT;

-- CreateIndex
CREATE INDEX "homework_practicalId_idx" ON "homework"("practicalId");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_practicalId_fkey" FOREIGN KEY ("practicalId") REFERENCES "practical_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
