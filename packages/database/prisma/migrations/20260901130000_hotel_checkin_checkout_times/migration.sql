-- AlterTable
-- Standard check-in/check-out policy times ("HH:mm"), configurable per hotel.
ALTER TABLE "hotels" ADD COLUMN "check_in_time" TEXT NOT NULL DEFAULT '14:00';
ALTER TABLE "hotels" ADD COLUMN "check_out_time" TEXT NOT NULL DEFAULT '11:00';
