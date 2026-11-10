-- Live school bus tracking (additive): driver/assistant logins on vehicles, trips, location pings (kept 30 days) and boarding events.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "assistantUserId" TEXT,
ADD COLUMN     "driverUserId" TEXT;

-- CreateTable
CREATE TABLE "bus_trips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT,
    "vehicleId" TEXT,
    "driverUserId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "routeName" TEXT NOT NULL,
    "vehicleName" TEXT,
    "driverName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastAccuracy" DOUBLE PRECISION,
    "lastSpeed" DOUBLE PRECISION,
    "lastHeading" DOUBLE PRECISION,
    "lastFixAt" TIMESTAMP(3),
    "fixCount" INTEGER NOT NULL DEFAULT 0,
    "distanceM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nearNotified" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "bus_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_pings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bus_pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_boardings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    CONSTRAINT "bus_boardings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bus_trips_tenantId_status_idx" ON "bus_trips"("tenantId", "status");

-- CreateIndex
CREATE INDEX "bus_trips_tenantId_startedAt_idx" ON "bus_trips"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "bus_trips_routeId_status_idx" ON "bus_trips"("routeId", "status");

-- CreateIndex
CREATE INDEX "bus_pings_tripId_recordedAt_idx" ON "bus_pings"("tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "bus_pings_receivedAt_idx" ON "bus_pings"("receivedAt");

-- CreateIndex
CREATE INDEX "bus_boardings_tenantId_studentId_idx" ON "bus_boardings"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "bus_boardings_tripId_studentId_kind_key" ON "bus_boardings"("tripId", "studentId", "kind");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assistantUserId_fkey" FOREIGN KEY ("assistantUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_trips" ADD CONSTRAINT "bus_trips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_trips" ADD CONSTRAINT "bus_trips_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_trips" ADD CONSTRAINT "bus_trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_trips" ADD CONSTRAINT "bus_trips_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_pings" ADD CONSTRAINT "bus_pings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_pings" ADD CONSTRAINT "bus_pings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "bus_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_boardings" ADD CONSTRAINT "bus_boardings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_boardings" ADD CONSTRAINT "bus_boardings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "bus_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_boardings" ADD CONSTRAINT "bus_boardings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
