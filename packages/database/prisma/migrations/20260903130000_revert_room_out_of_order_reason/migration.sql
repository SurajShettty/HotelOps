-- AlterTable
-- Superseded by RoomBlock (reason + date range), which already syncs with
-- the Calendar and availability checks — see the RoomBlock model instead.
ALTER TABLE "rooms" DROP COLUMN "out_of_order_reason";
