-- Disputes Salon Partners raise with Beaunic Admin (/api/dispute/*): "Raise a Dispute" and "Dispute History"
-- Run once on the beaunic database BEFORE uploading the dispute APIs.
CREATE TABLE `wl_disputes` (
  `dispute_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique dispute ID (shown as DSP-032)',
  `salon_id` int NOT NULL COMMENT 'Salon ID - References wl_customers (Salon Partner, customer_type 1, who raised the dispute)',
  `related_type` enum('booking','order') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'What it is about: booking = wl_bookings, order = wl_order (membership order); NULL = general',
  `related_id` int NOT NULL DEFAULT 0 COMMENT 'wl_bookings.booking_id or wl_order.order_id; 0 when not linked',
  `dispute_subject` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Issue Summary - one line about the issue',
  `dispute_description` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Description - what happened and what the partner needs from Admin',
  `status` enum('1','2','3','4') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Dispute status: 1 = Open, 2 = In Review, 3 = Resolved, 4 = Rejected',
  `admin_response` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reply / decision from Beaunic Admin, shown on View Details',
  `admin_id` int NOT NULL DEFAULT 0 COMMENT 'tbl_admin.admin_id who handled the dispute; 0 = not yet',
  `dispute_resolved_date` datetime DEFAULT NULL COMMENT 'Date and time when Admin resolved or rejected it',
  `dispute_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the dispute was raised (UTC)',
  `dispute_updated_date` datetime DEFAULT NULL COMMENT 'Date and time of the last change (UTC)',
  PRIMARY KEY (`dispute_id`),
  KEY `idx_disputes_salon_id` (`salon_id`, `status`),
  KEY `idx_disputes_related` (`related_type`, `related_id`),
  CONSTRAINT `wl_disputes_salon_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Disputes salon partners raise with Beaunic Admin';
