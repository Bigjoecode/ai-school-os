-- ID card and calendar feed revocation (additive): a version printed into each ID card QR code and
-- each calendar feed link; raising it cuts off what was handed out before.

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "idCardVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "idCardVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendarFeedVersion" INTEGER NOT NULL DEFAULT 0;
