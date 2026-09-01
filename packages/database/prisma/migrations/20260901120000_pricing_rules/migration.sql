-- CreateEnum
CREATE TYPE "PriceAdjustmentType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
-- Seasonal/weekend/dynamic rate adjustments on top of a room type's base
-- rate. Not yet consumed by booking/checkout pricing — see PricingRule doc
-- comment in schema.prisma.
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_type_id" TEXT,
    "name" TEXT NOT NULL,
    "adjustment_type" "PriceAdjustmentType" NOT NULL,
    "adjustment_value" DECIMAL(6,2) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "days_of_week" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_rules_hotel_id_idx" ON "pricing_rules"("hotel_id");

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
