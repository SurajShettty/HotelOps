-- AlterTable
ALTER TABLE "hotels" ADD COLUMN "housekeeping_auto_assign_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "housekeeping_floor_assignments" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "housekeeping_floor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_floor_assignments_hotel_id_floor_key" ON "housekeeping_floor_assignments"("hotel_id", "floor");

-- AddForeignKey
ALTER TABLE "housekeeping_floor_assignments" ADD CONSTRAINT "housekeeping_floor_assignments_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_floor_assignments" ADD CONSTRAINT "housekeeping_floor_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
