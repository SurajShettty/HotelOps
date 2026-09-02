-- AlterTable
ALTER TABLE "housekeeping_tasks" ADD COLUMN "nudged_at" TIMESTAMP(3),
ADD COLUMN "nudged_by" TEXT;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_nudged_by_fkey" FOREIGN KEY ("nudged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
