-- Reviews Users write in the app (POST /api/review/add)
-- Run once on the beaunic database before using the review APIs.
CREATE TABLE `wl_reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique review ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (User, customer_type 2, who wrote the review)',
  `review_type` enum('salon','service','employee','product') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'What is being reviewed',
  `review_for_id` int NOT NULL COMMENT 'ID of the reviewed item: wl_customers (salon), wl_services (service), ...',
  `salon_id` int NOT NULL DEFAULT '0' COMMENT 'Salon ID - References wl_customers (Salon Partner the reviewed item belongs to)',
  `rating` tinyint NOT NULL COMMENT 'Star rating, 1 to 5',
  `review_text` text COLLATE utf8mb4_unicode_ci COMMENT 'Review written by the user',
  `status` enum('1','0','2') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Review status: 1 = Active, 0 = Inactive, 2 = Deleted',
  `review_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the review was added',
  `review_updated_date` datetime DEFAULT NULL COMMENT 'Date and time when the review was last updated',
  PRIMARY KEY (`review_id`),
  KEY `idx_reviews_customer_id` (`customer_id`),
  KEY `idx_reviews_review_for` (`review_type`, `review_for_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ratings and reviews users give to salons, services, employees and products';
