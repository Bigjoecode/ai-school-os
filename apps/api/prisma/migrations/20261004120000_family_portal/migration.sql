-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "portalSettings" JSONB;

-- AlterTable
ALTER TABLE "website_downloads" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "classLevelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
