-- Track how many guests are staying in each booked room, so it can be
-- validated against the room type's max occupancy.
ALTER TABLE "booking_rooms" ADD COLUMN "occupants" INTEGER NOT NULL DEFAULT 1;
