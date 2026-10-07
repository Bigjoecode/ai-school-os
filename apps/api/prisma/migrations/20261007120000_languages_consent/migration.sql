-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "dataConsentAt" TIMESTAMP(3),
ADD COLUMN     "dataConsentVersion" TEXT,
ADD COLUMN     "preferredLanguage" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "tutorLanguage" TEXT;
