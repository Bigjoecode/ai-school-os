-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "operationsSettings" JSONB;

-- CreateTable
CREATE TABLE "library_books" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "category" TEXT NOT NULL,
    "publisher" TEXT,
    "publishedYear" INTEGER,
    "shelf" TEXT,
    "subject" TEXT,
    "level" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_loans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "returnedOn" DATE,
    "fineKobo" INTEGER NOT NULL DEFAULT 0,
    "finePaid" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "sku" TEXT,
    "location" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "unitCostKobo" INTEGER NOT NULL DEFAULT 0,
    "isAsset" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "unitCostKobo" INTEGER,
    "reason" TEXT,
    "issuedTo" TEXT,
    "supplier" TEXT,
    "movedOn" DATE NOT NULL,
    "recordedById" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "assistantName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleId" TEXT,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stop" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'BOTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "wardenStaffId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beds" INTEGER NOT NULL,

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bed" INTEGER,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exeats" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "leaveAt" TIMESTAMP(3) NOT NULL,
    "expectedReturnAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "collectedBy" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "organisation" TEXT,
    "purpose" TEXT NOT NULL,
    "hostStaffId" TEXT,
    "hostName" TEXT,
    "badgeNumber" TEXT,
    "vehiclePlate" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "recordedById" TEXT,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "childName" TEXT,
    "classOfInterest" TEXT,
    "entryTerm" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WALK_IN',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "question" TEXT,
    "notes" TEXT,
    "followUpOn" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_pickups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "collectedBy" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "onRecord" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "student_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientInfo" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "issuedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_books_tenantId_title_idx" ON "library_books"("tenantId", "title");

-- CreateIndex
CREATE INDEX "library_loans_tenantId_returnedOn_idx" ON "library_loans"("tenantId", "returnedOn");

-- CreateIndex
CREATE INDEX "library_loans_bookId_idx" ON "library_loans"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenantId_name_key" ON "inventory_items"("tenantId", "name");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_movedOn_idx" ON "stock_movements"("tenantId", "movedOn");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_createdAt_idx" ON "stock_movements"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenantId_plateNumber_key" ON "vehicles"("tenantId", "plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transport_routes_tenantId_name_key" ON "transport_routes"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_assignments_studentId_key" ON "transport_assignments"("studentId");

-- CreateIndex
CREATE INDEX "transport_assignments_tenantId_routeId_idx" ON "transport_assignments"("tenantId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "hostels_tenantId_name_key" ON "hostels"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_hostelId_name_key" ON "hostel_rooms"("hostelId", "name");

-- CreateIndex
CREATE INDEX "hostel_allocations_tenantId_active_idx" ON "hostel_allocations"("tenantId", "active");

-- CreateIndex
CREATE INDEX "hostel_allocations_studentId_idx" ON "hostel_allocations"("studentId");

-- CreateIndex
CREATE INDEX "exeats_tenantId_returnedAt_idx" ON "exeats"("tenantId", "returnedAt");

-- CreateIndex
CREATE INDEX "visitors_tenantId_checkInAt_idx" ON "visitors"("tenantId", "checkInAt");

-- CreateIndex
CREATE INDEX "enquiries_tenantId_status_idx" ON "enquiries"("tenantId", "status");

-- CreateIndex
CREATE INDEX "student_pickups_tenantId_at_idx" ON "student_pickups"("tenantId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_tenantId_serial_key" ON "certificates"("tenantId", "serial");

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_wardenStaffId_fkey" FOREIGN KEY ("wardenStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_hostStaffId_fkey" FOREIGN KEY ("hostStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pickups" ADD CONSTRAINT "student_pickups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pickups" ADD CONSTRAINT "student_pickups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grant the new operations permissions to existing schools' built-in roles.
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read','library.manage','inventory.read','inventory.manage','transport.read','transport.manage','hostel.read','hostel.manage','reception.read','reception.manage','documents.issue'])) WHERE "isSystem" AND "key" = 'school_admin';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read','inventory.read','transport.read','hostel.read','reception.read','documents.issue'])) WHERE "isSystem" AND "key" = 'principal';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read','transport.read','hostel.read','reception.read','documents.issue'])) WHERE "isSystem" AND "key" = 'vice_principal';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read','documents.issue'])) WHERE "isSystem" AND "key" = 'academic_coordinator';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read'])) WHERE "isSystem" AND "key" = 'teacher';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['inventory.read','inventory.manage','transport.read','hostel.read'])) WHERE "isSystem" AND "key" = 'accountant';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['documents.issue'])) WHERE "isSystem" AND "key" = 'hr_manager';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['reception.read','reception.manage','transport.read','hostel.read','staff.read'])) WHERE "isSystem" AND "key" = 'receptionist';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['library.read','library.manage'])) WHERE "isSystem" AND "key" = 'librarian';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['transport.read','transport.manage','guardians.read'])) WHERE "isSystem" AND "key" = 'transport_manager';
UPDATE "roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['hostel.read','hostel.manage','guardians.read','staff.read'])) WHERE "isSystem" AND "key" = 'hostel_manager';
