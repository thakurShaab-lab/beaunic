-- Services a Salon Partner adds in the app (POST /api/service/add)
-- Run once on the beaunic database before using the service APIs.
CREATE TABLE `wl_services` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL COMMENT 'wl_customers, the Salon Partner',
  `membership_id` int NOT NULL DEFAULT '0' COMMENT 'wl_memberships, the plan active when the service was added',
  `category_id` int NOT NULL DEFAULT '0' COMMENT 'wl_categories',
  `service_name` varchar(100) NOT NULL,
  `service_image` varchar(200) DEFAULT NULL,
  `service_price` decimal(10,2) DEFAULT NULL COMMENT 'NULL = Price not set',
  `status` enum('1','0','2') NOT NULL DEFAULT '1' COMMENT '1=Active, 0=Inactive, 2=Deleted',
  `service_added_date` datetime DEFAULT NULL,
  `service_updated_date` datetime DEFAULT NULL,
  PRIMARY KEY (`service_id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_membership_id` (`membership_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
