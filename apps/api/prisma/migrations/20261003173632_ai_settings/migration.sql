-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
