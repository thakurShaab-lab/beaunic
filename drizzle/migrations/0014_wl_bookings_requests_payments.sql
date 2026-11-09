-- Reschedule / cancellation approval by the Salon Partner, and Online vs Cash payments (/api/booking/*, /api/home/partner)
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_bookings`
  ADD COLUMN `cancel_status` enum('none','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'Cancellation request: none, pending, approved (booking cancelled), rejected (booking unchanged)' AFTER `booking_cancelled_date`,
  ADD COLUMN `cancel_requested_date` datetime DEFAULT NULL COMMENT 'When the customer asked to cancel' AFTER `cancel_status`,
  ADD COLUMN `cancel_responded_date` datetime DEFAULT NULL COMMENT 'When the partner approved / rejected it' AFTER `cancel_requested_date`,
  ADD COLUMN `cancel_response_note` text COLLATE utf8mb4_unicode_ci COMMENT 'Partner''s note with the decision' AFTER `cancel_responded_date`,
  ADD COLUMN `reschedule_status` enum('none','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'Reschedule request: none, pending, approved (moved), rejected (unchanged)' AFTER `cancel_response_note`,
  ADD COLUMN `requested_slot_id` int DEFAULT NULL COMMENT 'Reschedule: slot asked for - References wl_booking_slots' AFTER `reschedule_status`,
  ADD COLUMN `requested_slot_date` date DEFAULT NULL AFTER `requested_slot_id`,
  ADD COLUMN `requested_start_time` time DEFAULT NULL AFTER `requested_slot_date`,
  ADD COLUMN `requested_end_time` time DEFAULT NULL AFTER `requested_start_time`,
  ADD COLUMN `previous_slot_id` int DEFAULT NULL COMMENT 'Reschedule: slot the booking had before an approved move' AFTER `requested_end_time`,
  ADD COLUMN `previous_slot_date` date DEFAULT NULL AFTER `previous_slot_id`,
  ADD COLUMN `previous_start_time` time DEFAULT NULL AFTER `previous_slot_date`,
  ADD COLUMN `previous_end_time` time DEFAULT NULL AFTER `previous_start_time`,
  ADD COLUMN `reschedule_requested_date` datetime DEFAULT NULL COMMENT 'When the customer asked to reschedule' AFTER `previous_end_time`,
  ADD COLUMN `reschedule_responded_date` datetime DEFAULT NULL COMMENT 'When the partner approved / rejected it' AFTER `reschedule_requested_date`,
  ADD COLUMN `reschedule_response_note` text COLLATE utf8mb4_unicode_ci COMMENT 'Partner''s note with the decision' AFTER `reschedule_responded_date`,
  ADD COLUMN `payment_mode` enum('online','cash') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'How the amount was received: online or cash' AFTER `reschedule_response_note`,
  ADD COLUMN `payment_received_date` datetime DEFAULT NULL COMMENT 'When the payment was received' AFTER `payment_mode`,
  ADD KEY `idx_bookings_salon_requests` (`salon_id`, `cancel_status`, `reschedule_status`);

-- Bookings cancelled before approval existed count as approved cancellations
UPDATE `wl_bookings` SET `cancel_status` = 'approved' WHERE `is_cancel` = '1' OR `order_status` = 'Cancelled';
