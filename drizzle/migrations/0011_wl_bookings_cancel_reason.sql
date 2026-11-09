-- Reason and refund method chosen on the Cancel Booking screen (/api/booking/cancel)
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_bookings`
  ADD COLUMN `cancel_reason` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reason for cancellation: change_of_plans, booked_by_mistake, better_time_slot, health_reasons, salon_too_far, other' AFTER `is_cancel`,
  ADD COLUMN `cancel_reason_note` text COLLATE utf8mb4_unicode_ci COMMENT 'What the customer wrote for "Other"' AFTER `cancel_reason`,
  ADD COLUMN `refund_method` enum('original','wallet') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Refund to: original = Original payment method, wallet = Beaunic Wallet; NULL when nothing was paid' AFTER `cancel_reason_note`;
