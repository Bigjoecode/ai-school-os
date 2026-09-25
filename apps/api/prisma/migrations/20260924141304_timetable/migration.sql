-- CreateEnum
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "class_subjects" ADD COLUMN     "doublePeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periodsPerWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roomKind" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bellSchedule" JSONB;

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_unavailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,

    CONSTRAINT "staff_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "generation" "GenerationState" NOT NULL DEFAULT 'NONE',
    "generationError" TEXT,
    "bellSchedule" JSONB NOT NULL,
    "report" JSONB,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "roomId" TEXT,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "doubleGroup" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenantId_name_key" ON "rooms"("tenantId", "name");

-- CreateIndex
CREATE INDEX "staff_unavailability_tenantId_idx" ON "staff_unavailability"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_unavailability_staffId_day_period_key" ON "staff_unavailability"("staffId", "day", "period");

-- CreateIndex
CREATE INDEX "timetables_tenantId_termId_idx" ON "timetables"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "timetable_entries_timetableId_teacherId_idx" ON "timetable_entries"("timetableId", "teacherId");

-- CreateIndex
CREATE INDEX "timetable_entries_tenantId_idx" ON "timetable_entries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_timetableId_classArmId_day_period_key" ON "timetable_entries"("timetableId", "classArmId", "day", "period");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "class_arms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Timetable permissions for existing schools' built-in roles.
UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['timetable.read', 'timetable.manage']))
 WHERE "isSystem" AND "key" IN ('school_admin', 'principal', 'vice_principal', 'academic_coordinator');

UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['timetable.read']))
 WHERE "isSystem" AND "key" IN ('teacher', 'accountant', 'hr_manager', 'receptionist', 'librarian', 'transport_manager', 'hostel_manager');
