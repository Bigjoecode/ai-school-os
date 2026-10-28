-- PRACTICAL homework: the teacher may count labs a student handed in before it was published.

-- AlterTable
ALTER TABLE "homework" ADD COLUMN "countEarlierLabs" BOOLEAN NOT NULL DEFAULT false;
