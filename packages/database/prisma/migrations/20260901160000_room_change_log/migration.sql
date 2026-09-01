-- CreateEnum
CREATE TYPE "RoomChangeType" AS ENUM ('UPGRADE', 'DOWNGRADE', 'LATERAL');

-- CreateTable
CREATE TABLE "room_change_logs" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "booking_room_id" TEXT NOT NULL,
    "from_room_id" TEXT NOT NULL,
    "to_room_id" TEXT NOT NULL,
    "previous_rate" DECIMAL(10,2) NOT NULL,
    "new_rate" DECIMAL(10,2) NOT NULL,
    "change_type" "RoomChangeType" NOT NULL,
    "reason" TEXT,
    "effective_date" DATE NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_change_logs_booking_id_idx" ON "room_change_logs"("booking_id");

-- AddForeignKey
ALTER TABLE "room_change_logs" ADD CONSTRAINT "room_change_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_change_logs" ADD CONSTRAINT "room_change_logs_booking_room_id_fkey" FOREIGN KEY ("booking_room_id") REFERENCES "booking_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_change_logs" ADD CONSTRAINT "room_change_logs_from_room_id_fkey" FOREIGN KEY ("from_room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_change_logs" ADD CONSTRAINT "room_change_logs_to_room_id_fkey" FOREIGN KEY ("to_room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_change_logs" ADD CONSTRAINT "room_change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
