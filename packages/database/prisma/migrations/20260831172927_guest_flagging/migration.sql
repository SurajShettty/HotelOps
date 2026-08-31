-- Let staff flag a guest (misbehavior, etc.) so the flag surfaces again
-- whenever that guest is looked up for a future booking.
ALTER TABLE "guests" ADD COLUMN     "flag_reason" TEXT,
ADD COLUMN     "flagged_at" TIMESTAMP(3),
ADD COLUMN     "flagged_by" TEXT,
ADD COLUMN     "is_flagged" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
