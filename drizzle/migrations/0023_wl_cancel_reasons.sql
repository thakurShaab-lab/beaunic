-- "Reason for cancellation" options on the Cancel Booking screen, managed from the admin panel.
-- reason_key is what wl_bookings.cancel_reason stores, so existing cancelled bookings keep matching.
-- Run once on the beaunic database BEFORE deploying the code that uses it.
CREATE TABLE `wl_cancel_reasons` (
  `reason_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique reason ID',
  `reason_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Stable code saved in wl_bookings.cancel_reason, e.g. change_of_plans',
  `reason_title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'Text shown to the customer, e.g. Change of plans',
  `requires_note` enum('0','1') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT '1 = the customer must type a note (wl_bookings.cancel_reason_note), e.g. Other',
  `sort_order` int DEFAULT NULL COMMENT 'Display order on the screen',
  `status` enum('1','0','2') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Status: 1 = Active, 0 = Inactive, 2 = Deleted',
  `reason_added_date` datetime DEFAULT NULL,
  `reason_updated_date` datetime DEFAULT NULL,
  PRIMARY KEY (`reason_id`),
  UNIQUE KEY `uq_cancel_reasons_key` (`reason_key`),
  KEY `idx_cancel_reasons_status` (`status`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Reasons a customer can pick when cancelling a booking';

INSERT INTO `wl_cancel_reasons` (`reason_key`, `reason_title`, `requires_note`, `sort_order`, `status`, `reason_added_date`, `reason_updated_date`) VALUES
  ('change_of_plans',   'Change of plans',          '0', 1, '1', NOW(), NOW()),
  ('booked_by_mistake', 'Booked by mistake',        '0', 2, '1', NOW(), NOW()),
  ('better_time_slot',  'Found a better time slot', '0', 3, '1', NOW(), NOW()),
  ('health_reasons',    'Health reasons',           '0', 4, '1', NOW(), NOW()),
  ('salon_too_far',     'Salon is too far',         '0', 5, '1', NOW(), NOW()),
  ('other',             'Other',                    '1', 6, '1', NOW(), NOW());
