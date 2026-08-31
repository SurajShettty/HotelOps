-- Prisma cannot express Postgres EXCLUDE constraints, so this file is applied
-- by hand after the initial schema migration. This is what actually prevents
-- double-booking under concurrency: two transactions racing to insert
-- overlapping ranges for the same room will have one aborted by Postgres
-- itself, regardless of what the application layer checked first.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- booking_rooms.date_range mirrors the parent booking's [check_in, check_out)
-- range, but only while the booking is in an active status (CONFIRMED or
-- CHECKED_IN) — NULL otherwise, so cancelled/checked-out/no-show bookings
-- don't block re-booking the room. It can't be a generated column because
-- Postgres generated columns can't reference another table, so a trigger
-- keeps it in sync instead.
ALTER TABLE booking_rooms
  ADD COLUMN IF NOT EXISTS date_range daterange;

CREATE OR REPLACE FUNCTION sync_booking_room_date_range(p_booking_id text)
RETURNS void AS $$
  UPDATE booking_rooms br
  SET date_range = CASE
    WHEN b.status IN ('CONFIRMED', 'CHECKED_IN')
      THEN daterange(b.check_in_date, b.check_out_date, '[)')
    ELSE NULL
  END
  FROM bookings b
  WHERE b.id = p_booking_id
    AND br.booking_id = p_booking_id;
$$ LANGUAGE sql;

-- Keep booking_rooms.date_range in sync whenever a booking's dates or status change.
CREATE OR REPLACE FUNCTION trg_bookings_sync_date_range()
RETURNS trigger AS $$
BEGIN
  PERFORM sync_booking_room_date_range(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_sync_date_range ON bookings;
CREATE TRIGGER bookings_sync_date_range
  AFTER INSERT OR UPDATE OF check_in_date, check_out_date, status ON bookings
  FOR EACH ROW EXECUTE FUNCTION trg_bookings_sync_date_range();

-- Populate date_range on a booking_room row as soon as it's inserted
-- (the parent booking row already exists in the same transaction by then).
CREATE OR REPLACE FUNCTION trg_booking_rooms_sync_date_range()
RETURNS trigger AS $$
BEGIN
  PERFORM sync_booking_room_date_range(NEW.booking_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_rooms_sync_date_range ON booking_rooms;
CREATE TRIGGER booking_rooms_sync_date_range
  AFTER INSERT ON booking_rooms
  FOR EACH ROW EXECUTE FUNCTION trg_booking_rooms_sync_date_range();

-- No two active bookings may hold overlapping date ranges on the same room.
ALTER TABLE booking_rooms DROP CONSTRAINT IF EXISTS booking_rooms_no_overlap;
ALTER TABLE booking_rooms
  ADD CONSTRAINT booking_rooms_no_overlap
  EXCLUDE USING gist (room_id WITH =, date_range WITH &&)
  WHERE (date_range IS NOT NULL);

-- Room blocks follow the same pattern; start/end live on the same row, so a
-- generated column is enough here.
ALTER TABLE room_blocks
  ADD COLUMN IF NOT EXISTS date_range daterange
  GENERATED ALWAYS AS (daterange(start_date, end_date, '[)')) STORED;

ALTER TABLE room_blocks DROP CONSTRAINT IF EXISTS room_blocks_no_overlap;
ALTER TABLE room_blocks
  ADD CONSTRAINT room_blocks_no_overlap
  EXCLUDE USING gist (room_id WITH =, date_range WITH &&);
