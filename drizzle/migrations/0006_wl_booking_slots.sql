-- Booking slots Salon Partners create in the app (/api/slot/*)
-- Run once on the beaunic database before using the slot APIs.
CREATE TABLE `wl_booking_slots` (
  `slot_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique slot ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (Salon Partner, customer_type 1, offering the slot)',
  `slot_date` date NOT NULL COMMENT 'Date of the slot',
  `start_time` time NOT NULL COMMENT 'Slot start time',
  `end_time` time NOT NULL COMMENT 'Slot end time',
  `max_bookings` int NOT NULL DEFAULT '1' COMMENT 'Maximum bookings allowed in this slot',
  `booked_count` int NOT NULL DEFAULT '0' COMMENT 'Bookings made in this slot so far',
  `status` enum('1','0','2') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Slot status: 1 = Active, 0 = Inactive, 2 = Deleted',
  `slot_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the slot was created',
  `slot_updated_date` datetime DEFAULT NULL COMMENT 'Date and time when the slot was last updated',
  PRIMARY KEY (`slot_id`),
  KEY `idx_booking_slots_customer_date` (`customer_id`, `slot_date`),
  CONSTRAINT `wl_booking_slots_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Time slots salon partners open for bookings';
