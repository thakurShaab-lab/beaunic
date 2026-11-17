-- The customer's message with a reschedule request (/api/booking/reschedule "reason"), shown on the partner's
-- Reschedule Request screen (/api/booking/partner/reschedule-request).
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_bookings`
  ADD COLUMN `reschedule_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'What the customer wrote when asking to reschedule' AFTER `requested_end_time`;
