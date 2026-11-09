-- Services Users save to their favorites (/api/favorite/*)
-- Run once on the beaunic database before using the favorite APIs.
CREATE TABLE `wl_favorite_services` (
  `favorite_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique favorite ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (User, customer_type 2, who saved the service)',
  `service_id` int NOT NULL COMMENT 'Service ID - References wl_services (saved service)',
  `favorite_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the service was added to favorites',
  PRIMARY KEY (`favorite_id`),
  UNIQUE KEY `uq_favorite_services_customer_service` (`customer_id`, `service_id`),
  KEY `idx_favorite_services_service_id` (`service_id`),
  CONSTRAINT `wl_favorite_services_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`),
  CONSTRAINT `wl_favorite_services_service_id_fk` FOREIGN KEY (`service_id`) REFERENCES `wl_services` (`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Services users saved to their favorites';
