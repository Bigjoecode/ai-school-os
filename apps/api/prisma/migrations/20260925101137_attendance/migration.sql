-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "attendanceSettings" JSONB;

-- CreateTable
CREATE TABLE "attendance_registers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "takenById" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_registers_tenantId_date_idx" ON "attendance_registers"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registers_classArmId_date_key" ON "attendance_registers"("classArmId", "date");

-- CreateIndex
CREATE INDEX "student_attendance_tenantId_studentId_date_idx" ON "student_attendance"("tenantId", "studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_registerId_studentId_key" ON "student_attendance"("registerId", "studentId");

-- CreateIndex
CREATE INDEX "staff_attendance_tenantId_date_idx" ON "staff_attendance"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staffId_date_key" ON "staff_attendance"("staffId", "date");

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "class_arms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "attendance_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attendance permissions for existing schools' built-in roles.
UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['attendance.read', 'attendance.take', 'attendance.manage']))
 WHERE "isSystem" AND "key" IN ('school_admin', 'principal', 'vice_principal');

UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['attendance.read', 'attendance.take']))
 WHERE "isSystem" AND "key" IN ('teacher', 'academic_coordinator');

UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['attendance.read', 'attendance.manage']))
 WHERE "isSystem" AND "key" = 'hr_manager';

UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['attendance.read']))
 WHERE "isSystem" AND "key" = 'receptionist';
