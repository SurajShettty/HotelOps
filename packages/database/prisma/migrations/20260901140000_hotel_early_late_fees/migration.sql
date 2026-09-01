-- AlterTable
-- Early check-in / late check-out fees, applied against checkInTime/checkOutTime; 0 disables.
ALTER TABLE "hotels" ADD COLUMN "early_check_in_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "hotels" ADD COLUMN "late_check_out_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;
