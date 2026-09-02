-- AlterTable
ALTER TABLE "guests" ADD COLUMN "id_verified_at" TIMESTAMP(3);
ALTER TABLE "guests" ADD COLUMN "id_verified_by" TEXT;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_id_verified_by_fkey" FOREIGN KEY ("id_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
