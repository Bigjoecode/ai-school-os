-- AlterTable
ALTER TABLE "files" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "school_events" ADD COLUMN     "showOnWebsite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "showOnWebsite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "websiteBio" TEXT;

-- AlterTable
ALTER TABLE "tenant_domains" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PORTAL';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "websiteSettings" JSONB;

-- CreateTable
CREATE TABLE "website_posts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'NEWS',
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_albums" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_photos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_downloads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "fileUrl" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_access_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_posts_tenantId_status_publishedAt_idx" ON "website_posts"("tenantId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "website_posts_tenantId_slug_key" ON "website_posts"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "website_albums_tenantId_idx" ON "website_albums"("tenantId");

-- CreateIndex
CREATE INDEX "website_photos_albumId_sortOrder_idx" ON "website_photos"("albumId", "sortOrder");

-- CreateIndex
CREATE INDEX "website_downloads_tenantId_idx" ON "website_downloads"("tenantId");

-- CreateIndex
CREATE INDEX "website_messages_tenantId_status_idx" ON "website_messages"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "result_access_codes_studentId_termId_key" ON "result_access_codes"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "result_access_codes_tenantId_code_key" ON "result_access_codes"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "website_posts" ADD CONSTRAINT "website_posts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_albums" ADD CONSTRAINT "website_albums_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_photos" ADD CONSTRAINT "website_photos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_photos" ADD CONSTRAINT "website_photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "website_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_downloads" ADD CONSTRAINT "website_downloads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_messages" ADD CONSTRAINT "website_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_access_codes" ADD CONSTRAINT "result_access_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_access_codes" ADD CONSTRAINT "result_access_codes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_access_codes" ADD CONSTRAINT "result_access_codes_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Website management for existing schools' admins and principals.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['website.manage'])) WHERE "isSystem" AND "key" IN ('school_admin','principal');
