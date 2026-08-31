-- Itemized incidental charges (water bottle, minibar, etc.) logged against a
-- booking during the stay, rolled into the checkout folio automatically.
CREATE TABLE "room_charges" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_charges_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "room_charges" ADD CONSTRAINT "room_charges_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_charges" ADD CONSTRAINT "room_charges_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
