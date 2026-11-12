-- Bank details managed from the profile (/api/profile/update, shown in /api/profile/details)
-- Run once on the beaunic database BEFORE deploying the code that uses it.
CREATE TABLE `wl_customer_bank_details` (
  `bank_detail_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (owner); one row per customer',
  `account_holder_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Name on the account',
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '9-18 digits',
  `ifsc_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IFSC, e.g. SBIN0001234',
  `branch_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_type` enum('savings','current') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'savings or current',
  `upi_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UPI ID, e.g. salon@okhdfcbank',
  `bank_detail_added_date` datetime DEFAULT NULL,
  `bank_detail_updated_date` datetime DEFAULT NULL,
  PRIMARY KEY (`bank_detail_id`),
  UNIQUE KEY `uq_customer_bank_details_customer_id` (`customer_id`),
  CONSTRAINT `wl_customer_bank_details_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customers'' bank details';
