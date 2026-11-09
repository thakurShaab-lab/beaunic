-- Cancelled flag on bookings (/api/booking/cancel sets it to 1)
-- Run once on the beaunic database (after 0007_wl_bookings.sql).
ALTER TABLE `wl_bookings`
  ADD COLUMN `is_cancel` enum('0','1') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT 'Cancelled: 0 = Not Cancelled, 1 = Cancelled' AFTER `booking_notes`;

-- Bookings already cancelled before this column existed
UPDATE `wl_bookings` SET `is_cancel` = '1' WHERE `order_status` = 'Cancelled';
