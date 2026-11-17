-- /api/booking/cancel now takes the reason's ID from wl_cancel_reasons (run 0023 first).
-- cancel_reason keeps the reason's key as well, so bookings cancelled before this still show their reason.
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_bookings`
  ADD COLUMN `cancel_reason_id` int DEFAULT NULL COMMENT 'wl_cancel_reasons.reason_id picked on the Cancel Booking screen; NULL for bookings cancelled before reasons moved to the table' AFTER `is_cancel`;

-- Link the bookings already cancelled with a reason
UPDATE `wl_bookings` b
  JOIN `wl_cancel_reasons` r ON r.`reason_key` = b.`cancel_reason`
  SET b.`cancel_reason_id` = r.`reason_id`
  WHERE b.`cancel_reason_id` IS NULL;
