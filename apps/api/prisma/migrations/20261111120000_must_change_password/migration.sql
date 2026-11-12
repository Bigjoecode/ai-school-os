-- Admin password resets (additive): the person is asked to choose their own password at next sign-in.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
