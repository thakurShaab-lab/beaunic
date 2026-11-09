CREATE TABLE `wl_booking_slots` (
	`slot_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`slot_date` date NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`max_bookings` int NOT NULL DEFAULT 1,
	`booked_count` int NOT NULL DEFAULT 0,
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`slot_added_date` datetime,
	`slot_updated_date` datetime,
	CONSTRAINT `wl_booking_slots_slot_id` PRIMARY KEY(`slot_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_bookings` (
	`booking_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL DEFAULT 0,
	`customer_type` varchar(100) DEFAULT 'Member',
	`invoice_number` varchar(30),
	`first_name` varchar(50),
	`last_name` varchar(50),
	`mobile_number` varchar(50),
	`phone` varchar(50),
	`email` varchar(50),
	`discount_coupon_id` int NOT NULL DEFAULT 0,
	`discount_coupon_code` varchar(40),
	`coupon_discount_amount` float(10,2),
	`total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`vat_amount` decimal(10,2) DEFAULT '0.00',
	`vat_applied_cent` float(10,2) NOT NULL DEFAULT 0,
	`currency_code` char(3),
	`currency_symbol` char(10),
	`currency_value` decimal(14,6) NOT NULL DEFAULT '0.000000',
	`order_status` varchar(10) NOT NULL DEFAULT 'Placed',
	`order_received_date` datetime DEFAULT '0000-00-00 00:00:00',
	`payment_method` varchar(200),
	`payment_status` enum('Paid','Unpaid') NOT NULL DEFAULT 'Unpaid',
	`salon_id` int NOT NULL,
	`service_id` int NOT NULL,
	`slot_id` int NOT NULL,
	`service_name` varchar(255),
	`service_price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`slot_date` date NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`booking_notes` text,
	`is_cancel` enum('0','1') NOT NULL DEFAULT '0',
	`cancel_reason` varchar(50),
	`cancel_reason_note` text,
	`refund_method` enum('original','wallet'),
	`booking_cancelled_date` datetime,
	`cancel_status` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
	`cancel_requested_date` datetime,
	`cancel_responded_date` datetime,
	`cancel_response_note` text,
	`reschedule_status` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
	`requested_slot_id` int,
	`requested_slot_date` date,
	`requested_start_time` time,
	`requested_end_time` time,
	`previous_slot_id` int,
	`previous_slot_date` date,
	`previous_start_time` time,
	`previous_end_time` time,
	`reschedule_requested_date` datetime,
	`reschedule_responded_date` datetime,
	`reschedule_response_note` text,
	`payment_mode` enum('online','cash'),
	`payment_received_date` datetime,
	`booking_updated_date` datetime,
	CONSTRAINT `wl_bookings_booking_id` PRIMARY KEY(`booking_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_complaint_replies` (
	`reply_id` int AUTO_INCREMENT NOT NULL,
	`complaint_id` int NOT NULL,
	`customer_id` int NOT NULL,
	`customer_type` enum('1','2') NOT NULL,
	`reply_message` text NOT NULL,
	`reply_added_date` datetime,
	CONSTRAINT `wl_complaint_replies_reply_id` PRIMARY KEY(`reply_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_complaints` (
	`complaint_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`salon_id` int NOT NULL,
	`order_id` int NOT NULL,
	`complaint_subject` varchar(150) NOT NULL,
	`complaint_description` text NOT NULL,
	`status` enum('1','2','3','4') NOT NULL DEFAULT '1',
	`complaint_resolved_date` datetime,
	`complaint_closed_date` datetime,
	`complaint_added_date` datetime,
	`complaint_updated_date` datetime,
	CONSTRAINT `wl_complaints_complaint_id` PRIMARY KEY(`complaint_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_favorite_services` (
	`favorite_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`service_id` int NOT NULL,
	`favorite_added_date` datetime,
	CONSTRAINT `wl_favorite_services_favorite_id` PRIMARY KEY(`favorite_id`),
	CONSTRAINT `uq_favorite_services_customer_service` UNIQUE(`customer_id`,`service_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_membership_orders` (
	`order_id` bigint AUTO_INCREMENT NOT NULL,
	`order_date` datetime NOT NULL,
	`mem_id` int NOT NULL,
	`mship_id` int NOT NULL,
	`mship_name` varchar(50) NOT NULL,
	`duration` int NOT NULL,
	`buy_lead_count` int NOT NULL DEFAULT 0,
	`mship_price` decimal(11,2) NOT NULL,
	`payment_method` varchar(40),
	`pay_status` enum('0','1') NOT NULL DEFAULT '0',
	`status` enum('0','1','2') NOT NULL DEFAULT '0',
	`mship_image` longblob,
	`is_cost` int NOT NULL DEFAULT 0,
	`project_count` int DEFAULT 0,
	`type` int NOT NULL DEFAULT 0,
	`property_count` int NOT NULL DEFAULT 0,
	`customer_support` int NOT NULL DEFAULT 0,
	`expiry_date` varchar(50),
	`order_status` int NOT NULL DEFAULT 0,
	`invoice_doc` text,
	`cancel_reason` text,
	`cancel_date` varchar(50),
	`start_date` varchar(50),
	`img2` text,
	`order_type` int NOT NULL DEFAULT 1,
	`total_property_post` int NOT NULL DEFAULT 0,
	`total_project_post` int NOT NULL DEFAULT 0,
	`total_leads_buy` int NOT NULL DEFAULT 0,
	`is_latest` int NOT NULL,
	`send_notification` enum('Y','N') NOT NULL DEFAULT 'N',
	CONSTRAINT `wl_membership_orders_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_memberships` (
	`membership_id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(100) NOT NULL,
	`plan_name` varchar(255),
	`duration` int NOT NULL,
	`price` int NOT NULL,
	`description` text,
	`buy_lead_count` int NOT NULL DEFAULT 100,
	`status` enum('0','1','2') NOT NULL DEFAULT '0',
	`membership_image` text,
	`is_cost` int NOT NULL DEFAULT 0,
	`type` int NOT NULL DEFAULT 1,
	`added_date` datetime,
	`updated_date` datetime,
	`customer_support` int NOT NULL DEFAULT 0,
	`property_count` int NOT NULL DEFAULT 0,
	`project_count` int NOT NULL DEFAULT 0,
	`property_count_rent` int DEFAULT 0,
	`property_count_land` int DEFAULT 0,
	`property_type` int NOT NULL DEFAULT 0,
	CONSTRAINT `wl_memberships_membership_id` PRIMARY KEY(`membership_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_order` (
	`order_id` int AUTO_INCREMENT NOT NULL,
	`order_type` int NOT NULL DEFAULT 1,
	`customers_id` int NOT NULL DEFAULT 0,
	`invoice_number` varchar(30) NOT NULL,
	`first_name` varchar(80),
	`last_name` varchar(80),
	`email` varchar(80),
	`address` text,
	`state` varchar(255),
	`phone` varchar(30),
	`mship_id` int,
	`mship_name` varchar(100),
	`mship_price` float(10,2) DEFAULT 0,
	`mship_image` blob,
	`duration` int,
	`view_leads_count` int,
	`description` text,
	`pkg_start_date` date,
	`pkg_end_date` date,
	`currency_code` char(3) NOT NULL,
	`currency_value` char(10) NOT NULL,
	`currency_symbol` decimal(14,0) NOT NULL,
	`total_price` float(10,2),
	`order_status` enum('Pending','Closed','Canceled','Completed','Ready For Dispatch','Rejected','Deleted') NOT NULL DEFAULT 'Pending',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`payment_status` enum('Paid','Unpaid') NOT NULL DEFAULT 'Unpaid',
	`payment_method` varchar(100),
	`project_count` int DEFAULT 0,
	`property_count` int DEFAULT 0,
	`property_count_rent` int DEFAULT 0,
	`property_count_land` int NOT NULL DEFAULT 0,
	`total_property_post` int DEFAULT 0,
	`total_rent_property_post` int DEFAULT 0,
	`total_project_post` int DEFAULT 0,
	`total_land_post` int DEFAULT 0,
	`receive_date` datetime,
	`membership_status` enum('0','1') NOT NULL DEFAULT '0',
	`type` varchar(55) NOT NULL DEFAULT 'Owner',
	`is_latest` int,
	CONSTRAINT `wl_order_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_referral_codes` (
	`referral_code_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`referral_code` varchar(20) NOT NULL,
	`referral_code_added_date` datetime,
	CONSTRAINT `wl_referral_codes_referral_code_id` PRIMARY KEY(`referral_code_id`),
	CONSTRAINT `uq_referral_codes_customer_id` UNIQUE(`customer_id`),
	CONSTRAINT `uq_referral_codes_referral_code` UNIQUE(`referral_code`)
);
--> statement-breakpoint
CREATE TABLE `wl_referrals` (
	`referral_id` int AUTO_INCREMENT NOT NULL,
	`referrer_id` int NOT NULL,
	`referred_id` int NOT NULL,
	`referral_code` varchar(20) NOT NULL,
	`cashback_amount` decimal(10,2),
	`wallet_transaction_id` int NOT NULL DEFAULT 0,
	`status` enum('pending','credited','cancelled') NOT NULL DEFAULT 'pending',
	`referral_added_date` datetime,
	`referral_credited_date` datetime,
	CONSTRAINT `wl_referrals_referral_id` PRIMARY KEY(`referral_id`),
	CONSTRAINT `uq_referrals_referred_id` UNIQUE(`referred_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_reviews` (
	`review_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`review_type` enum('salon','service','employee','product') NOT NULL,
	`review_for_id` int DEFAULT null,
	`salon_id` int NOT NULL DEFAULT 0,
	`rating` tinyint NOT NULL,
	`review_text` text,
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`review_added_date` datetime,
	`review_updated_date` datetime,
	CONSTRAINT `wl_reviews_review_id` PRIMARY KEY(`review_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_services_media` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`service_id` int unsigned NOT NULL DEFAULT 0,
	`media_type` enum('photo','video','pdf') NOT NULL DEFAULT 'photo',
	`media` varchar(255),
	`is_default` enum('Y','N') NOT NULL DEFAULT 'N',
	`media_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_services_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_services` (
	`service_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`membership_id` int NOT NULL DEFAULT 0,
	`category_id` int NOT NULL DEFAULT 0,
	`service_name` varchar(100) NOT NULL,
	`salon_type` enum('salon','home_service'),
	`service_description` text,
	`service_price` decimal(10,2),
	`service_duration` int,
	`is_popular` enum('0','1') NOT NULL DEFAULT '1',
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`service_added_date` datetime,
	`service_updated_date` datetime,
	CONSTRAINT `wl_services_service_id` PRIMARY KEY(`service_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_wallet_transactions` (
	`transaction_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`transaction_type` enum('credit','debit') NOT NULL,
	`category` enum('cashback','refund','topup','booking_payment','order_payment') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`reference_number` varchar(30),
	`reference_id` int NOT NULL DEFAULT 0,
	`description` varchar(255),
	`payment_method` varchar(100),
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`transaction_added_date` datetime,
	CONSTRAINT `wl_wallet_transactions_transaction_id` PRIMARY KEY(`transaction_id`)
);
--> statement-breakpoint
ALTER TABLE `wl_customers` MODIFY COLUMN `gender` enum('Male','Female','Other') DEFAULT 'Male';--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `salon_type` enum('salon','home_service');--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `salon_name` varchar(100);--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `salon_logo` varchar(100);--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `app_id` varchar(255);--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `device_id` text;--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `app_type` varchar(255);--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `login_otp` varchar(6);--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `is_otp_verified` enum('0','1') DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_customers` ADD `login_date_time` datetime;--> statement-breakpoint
ALTER TABLE `wl_customers_address_book` ADD `additional_numbers` text;--> statement-breakpoint
ALTER TABLE `wl_customers_address_book` ADD `support_number` varchar(25);--> statement-breakpoint
ALTER TABLE `wl_faq` ADD `faq_category` enum('booking','payment','refund','general') DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_packages` ADD `package_type` enum('1','2') DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_packages` ADD `is_popular` enum('1','0') DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_booking_slots` ADD CONSTRAINT `wl_booking_slots_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_service_id_wl_services_service_id_fk` FOREIGN KEY (`service_id`) REFERENCES `wl_services`(`service_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_slot_id_wl_booking_slots_slot_id_fk` FOREIGN KEY (`slot_id`) REFERENCES `wl_booking_slots`(`slot_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaint_replies` ADD CONSTRAINT `wl_complaint_replies_complaint_id_wl_complaints_complaint_id_fk` FOREIGN KEY (`complaint_id`) REFERENCES `wl_complaints`(`complaint_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaint_replies` ADD CONSTRAINT `wl_complaint_replies_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaints` ADD CONSTRAINT `wl_complaints_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaints` ADD CONSTRAINT `wl_complaints_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_favorite_services` ADD CONSTRAINT `wl_favorite_services_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_favorite_services` ADD CONSTRAINT `wl_favorite_services_service_id_wl_services_service_id_fk` FOREIGN KEY (`service_id`) REFERENCES `wl_services`(`service_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referral_codes` ADD CONSTRAINT `wl_referral_codes_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referrals` ADD CONSTRAINT `wl_referrals_referrer_id_wl_customers_customer_id_fk` FOREIGN KEY (`referrer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referrals` ADD CONSTRAINT `wl_referrals_referred_id_wl_customers_customer_id_fk` FOREIGN KEY (`referred_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_wallet_transactions` ADD CONSTRAINT `wl_wallet_transactions_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_booking_slots_customer_date` ON `wl_booking_slots` (`customer_id`,`slot_date`);--> statement-breakpoint
CREATE INDEX `idx_bookings_customer_id` ON `wl_bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_salon_id` ON `wl_bookings` (`salon_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_slot_customer` ON `wl_bookings` (`slot_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_salon_requests` ON `wl_bookings` (`salon_id`,`cancel_status`,`reschedule_status`);--> statement-breakpoint
CREATE INDEX `idx_complaint_replies_complaint_id` ON `wl_complaint_replies` (`complaint_id`);--> statement-breakpoint
CREATE INDEX `idx_complaints_customer_id` ON `wl_complaints` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_complaints_salon_id` ON `wl_complaints` (`salon_id`);--> statement-breakpoint
CREATE INDEX `idx_favorite_services_service_id` ON `wl_favorite_services` (`service_id`);--> statement-breakpoint
CREATE INDEX `idx_referrals_referrer_id` ON `wl_referrals` (`referrer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `wl_reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_review_for` ON `wl_reviews` (`review_type`,`review_for_id`);--> statement-breakpoint
CREATE INDEX `idx_services_media_service_id` ON `wl_services_media` (`service_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_id` ON `wl_services` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_transactions_customer_id` ON `wl_wallet_transactions` (`customer_id`);--> statement-breakpoint
ALTER TABLE `wl_customers` DROP COLUMN `service_type`;