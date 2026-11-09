-- Makes the live tables match the Drizzle schema files (src/schema).
-- 1. wl_bookings had a stray column named `wl_bookings` (decimal(14,6), always 0) that no schema or migration defines.
-- 2. wl_complaints.order_id is NOT NULL in the schema (a complaint always has a booking); no rows are NULL.
ALTER TABLE `wl_bookings` DROP COLUMN `wl_bookings`;

ALTER TABLE `wl_complaints`
  MODIFY COLUMN `order_id` int NOT NULL COMMENT 'Booking ID - References wl_bookings (the booking the complaint is about)';
