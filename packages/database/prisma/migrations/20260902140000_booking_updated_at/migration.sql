-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "updated_at" TIMESTAMP(3);

-- Backfill: an untouched booking's "last action" is its creation.
UPDATE "bookings" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "bookings" ALTER COLUMN "updated_at" SET NOT NULL;
