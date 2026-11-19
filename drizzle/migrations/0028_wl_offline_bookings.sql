-- Offline Client Order (Salon Partners, customer_type 1): a booking the partner makes for a walk-in / phone client
-- in 4 steps (Client, Service, Booking, Summary). Run before uploading the code.

-- 1. An offline client has no app account, so the booking made for them has no customer: customer_id may be NULL
--    (the foreign key to wl_customers stays; it allows NULL). App bookings are unchanged.
ALTER TABLE `wl_bookings`
    MODIFY `customer_id` int NULL DEFAULT NULL;

-- 2. The offline booking while it is filled in, step by step. Step 4 (Confirm) makes the wl_bookings row,
--    sets booking_id and status = confirmed. A draft never takes a place in a slot.
CREATE TABLE IF NOT EXISTS `wl_offline_bookings` (
    `offline_booking_id` int NOT NULL AUTO_INCREMENT,
    `salon_id` int NOT NULL,                                   -- wl_customers, the Salon Partner who owns it
    `client_name` varchar(50) NOT NULL,                        -- Step 1
    `mobile_number` varchar(10) NOT NULL,                      -- Step 1
    `service_id` int NULL DEFAULT NULL,                        -- Step 2 (wl_services)
    `slot_id` int NULL DEFAULT NULL,                           -- Step 3 (wl_booking_slots)
    `payment_mode` enum('cash','online') NULL DEFAULT NULL,    -- Step 4
    `booking_id` int NULL DEFAULT NULL,                        -- Step 4: the confirmed booking (wl_bookings)
    `status` enum('draft','confirmed') NOT NULL DEFAULT 'draft',
    `offline_booking_added_date` datetime NOT NULL,
    `offline_booking_updated_date` datetime NOT NULL,
    PRIMARY KEY (`offline_booking_id`),
    KEY `idx_offline_bookings_salon` (`salon_id`, `status`),
    CONSTRAINT `fk_offline_bookings_salon` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers` (`customer_id`),
    CONSTRAINT `fk_offline_bookings_service` FOREIGN KEY (`service_id`) REFERENCES `wl_services` (`service_id`),
    CONSTRAINT `fk_offline_bookings_slot` FOREIGN KEY (`slot_id`) REFERENCES `wl_booking_slots` (`slot_id`),
    CONSTRAINT `fk_offline_bookings_booking` FOREIGN KEY (`booking_id`) REFERENCES `wl_bookings` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
