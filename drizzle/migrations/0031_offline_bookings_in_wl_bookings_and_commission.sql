-- 1. Offline bookings live in wl_bookings (customer_type 'Offline'). A partner fills them in step by step, so a draft
--    (order_status 'Draft') has no service / slot yet: those columns must allow NULL. Online bookings always set them.
ALTER TABLE `wl_bookings`
    MODIFY `service_id` int NULL DEFAULT NULL,
    MODIFY `slot_id` int NULL DEFAULT NULL,
    MODIFY `slot_date` date NULL DEFAULT NULL,
    MODIFY `start_time` time NULL DEFAULT NULL,
    MODIFY `end_time` time NULL DEFAULT NULL;

-- 2. Commission: `commission` (the % the partner pays the admin for the booking, set by the admin) already exists.
--    Whether that commission has been paid to the admin, and when:
ALTER TABLE `wl_bookings`
    ADD COLUMN `commission_status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid' AFTER `commission`,
    ADD COLUMN `commission_paid_date` datetime NULL DEFAULT NULL AFTER `commission_status`,
    ADD KEY `idx_bookings_salon_commission` (`salon_id`, `payment_status`, `commission_status`);

-- 3. Offline drafts still in wl_offline_bookings move to wl_bookings. (Confirmed ones are already there: their
--    booking_id rows.) Nothing to move on live today (all 3 are confirmed); kept for any created before the upload.
INSERT INTO `wl_bookings`
    (`customer_id`, `customer_type`, `first_name`, `last_name`, `mobile_number`, `order_status`, `order_received_date`,
     `payment_status`, `salon_id`, `service_id`, `slot_id`, `booking_updated_date`)
SELECT
    NULL, 'Offline',
    SUBSTRING_INDEX(o.client_name, ' ', 1),
    NULLIF(TRIM(SUBSTRING(o.client_name, LENGTH(SUBSTRING_INDEX(o.client_name, ' ', 1)) + 1)), ''),
    o.mobile_number, 'Draft', o.offline_booking_added_date,
    'Unpaid', o.salon_id, o.service_id, o.slot_id, o.offline_booking_updated_date
FROM `wl_offline_bookings` o
WHERE o.status = 'draft';
