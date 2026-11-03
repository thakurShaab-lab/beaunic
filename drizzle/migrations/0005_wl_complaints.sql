-- Complaints Users raise against salons, and the replies on them (/api/complaint/*)
-- Run once on the beaunic database before using the complaint APIs.
CREATE TABLE `wl_complaints` (
  `complaint_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique complaint ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (User, customer_type 2, who raised the complaint)',
  `salon_id` int NOT NULL COMMENT 'Salon ID - References wl_customers (Salon Partner, customer_type 1, the complaint is raised against)',
  `order_id` int NOT NULL COMMENT 'Order ID - References wl_orders (related order / booking)',
  `complaint_subject` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'One line about the issue',
  `complaint_description` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'What happened; the first message of the conversation',
  `status` enum('1','2','3','4') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Complaint status: 1 = Pending, 2 = In Progress, 3 = Resolved, 4 = Closed',
  `complaint_resolved_date` datetime DEFAULT NULL COMMENT 'Date and time when the complaint was resolved',
  `complaint_closed_date` datetime DEFAULT NULL COMMENT 'Date and time when the complaint was closed',
  `complaint_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the complaint was raised',
  `complaint_updated_date` datetime DEFAULT NULL COMMENT 'Date and time of the last change or reply',
  PRIMARY KEY (`complaint_id`),
  KEY `idx_complaints_customer_id` (`customer_id`),
  KEY `idx_complaints_salon_id` (`salon_id`),
  CONSTRAINT `wl_complaints_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`),
  CONSTRAINT `wl_complaints_salon_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Complaints users raise against salons';

CREATE TABLE `wl_complaint_replies` (
  `reply_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique reply ID',
  `complaint_id` int NOT NULL COMMENT 'Complaint ID - References wl_complaints',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (who sent the reply)',
  `customer_type` enum('1','2') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Sender type: 1 = Salon Partner, 2 = User',
  `reply_message` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Reply text',
  `reply_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the reply was sent',
  PRIMARY KEY (`reply_id`),
  KEY `idx_complaint_replies_complaint_id` (`complaint_id`),
  CONSTRAINT `wl_complaint_replies_complaint_id_fk` FOREIGN KEY (`complaint_id`) REFERENCES `wl_complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `wl_complaint_replies_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Replies on complaints from both the user and the salon partner';
