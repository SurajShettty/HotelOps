-- Allow a platform-wide role (SUPER_ADMIN) with no specific hotel.
ALTER TABLE "user_hotel_roles" ALTER COLUMN "hotel_id" DROP NOT NULL;
