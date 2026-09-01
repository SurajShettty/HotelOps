-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "reverted_at" TIMESTAMP(3),
ADD COLUMN     "reverted_by" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_hotel_id_created_at_idx" ON "audit_logs"("hotel_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
