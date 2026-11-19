CREATE TABLE `subadmin_activity_record` (
	`activity_id` int NOT NULL,
	`subadmin_id` varchar(50),
	`subadmin_name` varchar(255),
	`section` varchar(255),
	`action` tinytext,
	`matter_id` varchar(255),
	`matter_name` varchar(255),
	`added_date` datetime
);
--> statement-breakpoint
CREATE TABLE `tbl_admin_allowed_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subadmin_id` int NOT NULL,
	`sec_parent_id` int NOT NULL,
	`sec_id` int NOT NULL,
	`permission` varchar(25) DEFAULT '1',
	`allow_category_ids` varchar(255),
	CONSTRAINT `tbl_admin_allowed_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tbl_admin_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int NOT NULL DEFAULT 0,
	`section_title` varchar(100),
	`section_controller` varchar(100),
	`disp_order` int NOT NULL DEFAULT 0,
	`actual_privilege` varchar(80),
	`status` char(1) NOT NULL DEFAULT '1',
	CONSTRAINT `tbl_admin_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tbl_admin` (
	`admin_id` int AUTO_INCREMENT NOT NULL,
	`admin_type` enum('1','2','3') NOT NULL DEFAULT '2',
	`admin_key` varchar(15) NOT NULL,
	`admin_name` varchar(450),
	`admin_username` varchar(50) NOT NULL,
	`admin_password` varchar(80),
	`admin_email` varchar(255) NOT NULL,
	`litigation_days` int,
	`admin_last_login` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`address` text,
	`corporate_address` varchar(255),
	`city` varchar(100),
	`state` varchar(100),
	`country` varchar(100),
	`zipcode` varchar(50),
	`phone` varchar(50),
	`mobile` varchar(50),
	`fax` varchar(50),
	`contact_person` varchar(50),
	`contact_phone` varchar(50),
	`contact_email` varchar(50),
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`total_hits` bigint NOT NULL DEFAULT 0,
	`facebook_link` varchar(250),
	`twitter_link` varchar(250),
	`linkedin_link` varchar(250),
	`instagram_link` varchar(250),
	`youtube_link` varchar(250),
	`google_analytics_id` varchar(50),
	`google_web_code` text,
	`website` varchar(255),
	`whatsapp_number` varchar(20),
	`whatsapp_message` varchar(20),
	`post_date` date,
	CONSTRAINT `tbl_admin_admin_id` PRIMARY KEY(`admin_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_auto_respond_mails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email_section` varchar(80) NOT NULL,
	`email_subject` varchar(200) NOT NULL,
	`email_content` text NOT NULL,
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`updated_on` datetime,
	CONSTRAINT `wl_auto_respond_mails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_banners` (
	`banner_id` int AUTO_INCREMENT NOT NULL,
	`banner_position` varchar(100),
	`banner_image` varchar(200),
	`banner_url` varchar(170),
	`banner_page` varchar(30),
	`status` enum('1','0') DEFAULT '1',
	`clicks` int NOT NULL DEFAULT 0,
	`banner_added_date` datetime,
	`banner_start_date` datetime,
	`banner_end_date` datetime,
	CONSTRAINT `wl_banners_banner_id` PRIMARY KEY(`banner_id`)
);
--> statement-breakpoint
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
	`cancel_reason_id` int,
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
	`reschedule_reason` text,
	`previous_slot_id` int,
	`previous_slot_date` date,
	`previous_start_time` time,
	`previous_end_time` time,
	`reschedule_requested_date` datetime,
	`reschedule_responded_date` datetime,
	`reschedule_response_note` text,
	`payment_mode` enum('online','cash'),
	`payment_received_date` datetime,
	`payment_transaction_id` varchar(100),
	`booking_updated_date` datetime,
	`employee_id` int,
	`employee_assigned_date` datetime,
	`booking_completed_date` datetime,
	`cancelled_by` enum('customer','salon'),
	CONSTRAINT `wl_bookings_booking_id` PRIMARY KEY(`booking_id`),
	CONSTRAINT `uq_bookings_payment_transaction_id` UNIQUE(`payment_transaction_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_cancel_reasons` (
	`reason_id` int AUTO_INCREMENT NOT NULL,
	`reason_key` varchar(50) NOT NULL,
	`reason_title` varchar(100) NOT NULL DEFAULT '',
	`requires_note` enum('0','1') NOT NULL DEFAULT '0',
	`sort_order` int,
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`reason_added_date` datetime,
	`reason_updated_date` datetime,
	CONSTRAINT `wl_cancel_reasons_reason_id` PRIMARY KEY(`reason_id`),
	CONSTRAINT `uq_cancel_reasons_key` UNIQUE(`reason_key`)
);
--> statement-breakpoint
CREATE TABLE `wl_categories` (
	`category_id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(100),
	`category_links` varchar(255),
	`friendly_url` varchar(100),
	`category_image` varchar(255),
	`category_description` text,
	`parent_id` int NOT NULL DEFAULT 0,
	`is_home` enum('1','0') NOT NULL DEFAULT '0',
	`is_footer` enum('0','1') NOT NULL DEFAULT '0',
	`is_fixed` enum('1','0') NOT NULL DEFAULT '0',
	`sort_order` int,
	`date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`date_modified` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`meta_title` varchar(100),
	`meta_keywords` varchar(100),
	`meta_description` varchar(225),
	`category_alt` varchar(200),
	CONSTRAINT `wl_categories_category_id` PRIMARY KEY(`category_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_centers` (
	`center_id` int AUTO_INCREMENT NOT NULL,
	`center_name` varchar(90),
	`center_code` varchar(20),
	`friendly_url` varchar(100),
	`email` varchar(80),
	`password` varchar(80),
	`yoe` varchar(4),
	`phone_number` varchar(20),
	`address` varchar(255),
	`center_image` varchar(50),
	`city_id` int DEFAULT 0,
	`location_id` int NOT NULL DEFAULT 0,
	`center_description` text,
	`sort_order` int,
	`status` enum('1','0') NOT NULL DEFAULT '1',
	`center_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`center_date_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`current_login` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`last_login_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_centers_center_id` PRIMARY KEY(`center_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_cities` (
	`city_id` int AUTO_INCREMENT NOT NULL,
	`country_id` int NOT NULL DEFAULT 0,
	`title` varchar(80),
	`created_at` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`created_by` int NOT NULL DEFAULT 1,
	`status` char(1) NOT NULL DEFAULT '1',
	CONSTRAINT `wl_cities_city_id` PRIMARY KEY(`city_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_cms_pages` (
	`page_id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int NOT NULL DEFAULT 0,
	`page_name` varchar(50) NOT NULL DEFAULT '',
	`friendly_url` varchar(50) NOT NULL,
	`page_description` longtext NOT NULL,
	`page_short_description` text,
	`image` varchar(50) NOT NULL,
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`page_updated_date` datetime NOT NULL,
	CONSTRAINT `wl_cms_pages_page_id` PRIMARY KEY(`page_id`)
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
CREATE TABLE `wl_countries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country_name` varchar(64) NOT NULL,
	`country_temp_name` varchar(250) NOT NULL,
	`country_iso_code_2` char(2),
	`country_iso_code_3` char(3),
	`country_flag` varchar(80),
	`created_by` int NOT NULL DEFAULT 1,
	`status` char(1) NOT NULL DEFAULT '1',
	`TimeZone` varchar(32) NOT NULL,
	`UTC_offset` varchar(8) NOT NULL,
	CONSTRAINT `wl_countries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_coupon_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`name` varchar(150),
	`email` varchar(80),
	`description` text,
	`coupon_id` int NOT NULL,
	`used_count` int NOT NULL DEFAULT 0,
	`status` enum('0','1','2') NOT NULL DEFAULT '0',
	`receive_on` datetime NOT NULL,
	CONSTRAINT `wl_coupon_customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_coupons` (
	`coupon_id` int AUTO_INCREMENT NOT NULL,
	`coupon_title` varchar(200),
	`coupon_code` varchar(10),
	`coupon_type` enum('p','f','a') NOT NULL DEFAULT 'p',
	`coupon_usage` enum('multiple','single') NOT NULL DEFAULT 'single',
	`usage_count` int NOT NULL DEFAULT 1,
	`coupon_for` enum('0','1') NOT NULL DEFAULT '0',
	`coupon_discount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`maximum_coupon_discount` float(10,2) NOT NULL DEFAULT 0,
	`minimum_order_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`start_date` date,
	`end_date` date,
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_coupons_coupon_id` PRIMARY KEY(`coupon_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_course_categories` (
	`category_id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(100),
	`category_links` varchar(255),
	`friendly_url` varchar(100),
	`category_image` varchar(255),
	`category_description` text,
	`parent_id` int NOT NULL DEFAULT 0,
	`is_home` enum('1','0') NOT NULL DEFAULT '0',
	`is_footer` enum('0','1') NOT NULL DEFAULT '0',
	`is_fixed` enum('1','0') NOT NULL DEFAULT '0',
	`sort_order` int,
	`date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`date_modified` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`meta_title` varchar(100),
	`meta_keywords` varchar(100),
	`meta_description` varchar(225),
	`category_alt` varchar(200),
	CONSTRAINT `wl_course_categories_category_id` PRIMARY KEY(`category_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_courses` (
	`course_id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL DEFAULT 0,
	`category_id` int NOT NULL DEFAULT 0,
	`course_name` varchar(200),
	`friendly_url` varchar(110),
	`course_image` varchar(80),
	`course_brochure` varchar(80),
	`duration_id` int NOT NULL DEFAULT 0,
	`course_fee` float(15,2) NOT NULL DEFAULT 0,
	`course_description` text,
	`course_curriculum` text,
	`is_featured` enum('1','0') NOT NULL DEFAULT '0',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`center_status` tinyint NOT NULL DEFAULT 1,
	`course_added_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`course_updated_date` datetime DEFAULT '0000-00-00 00:00:00',
	`course_viewed` int unsigned NOT NULL DEFAULT 0,
	`course_alt` varchar(100),
	CONSTRAINT `wl_courses_course_id` PRIMARY KEY(`course_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_currencies` (
	`currency_id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(32) NOT NULL DEFAULT '',
	`code` varchar(3) NOT NULL DEFAULT '',
	`symbol_left` varchar(12) NOT NULL,
	`symbol_right` varchar(12) NOT NULL,
	`curr_image` varchar(250) NOT NULL,
	`decimal_place` char(1) NOT NULL,
	`value` float(15,8) NOT NULL,
	`is_default` enum('Y','N') NOT NULL DEFAULT 'N',
	`status` int NOT NULL,
	`date_modified` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_currencies_currency_id` PRIMARY KEY(`currency_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_customer_bank_details` (
	`bank_detail_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`account_holder_name` varchar(100),
	`bank_name` varchar(100),
	`account_number` varchar(20),
	`ifsc_code` varchar(11),
	`branch_name` varchar(100),
	`account_type` enum('savings','current'),
	`upi_id` varchar(100),
	`bank_detail_added_date` datetime,
	`bank_detail_updated_date` datetime,
	CONSTRAINT `wl_customer_bank_details_bank_detail_id` PRIMARY KEY(`bank_detail_id`),
	CONSTRAINT `uq_customer_bank_details_customer_id` UNIQUE(`customer_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_customers_address_book` (
	`address_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`first_name` varchar(40),
	`last_name` varchar(40),
	`name` varchar(32),
	`address` varchar(200),
	`mobile` varchar(25),
	`zipcode` varchar(25),
	`phone` varchar(25),
	`fax` varchar(50),
	`landmark` varchar(150),
	`city` varchar(50),
	`state` varchar(50),
	`country` varchar(80),
	`reciv_date` datetime NOT NULL,
	`address_type` enum('Bill','Ship') NOT NULL,
	`default_status` enum('Y','N') NOT NULL DEFAULT 'N',
	`additional_numbers` text,
	`support_number` varchar(25),
	CONSTRAINT `wl_customers_address_book_address_id` PRIMARY KEY(`address_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_customers` (
	`customer_id` int AUTO_INCREMENT NOT NULL,
	`user_name` varchar(80) NOT NULL,
	`password` varchar(100) NOT NULL,
	`title` varchar(10),
	`first_name` varchar(32),
	`last_name` varchar(32),
	`gender` enum('Male','Female','Other') DEFAULT 'Male',
	`birth_date` date,
	`customer_photo` varchar(32),
	`phone_number` varchar(32),
	`mobile_number` varchar(32),
	`fax_number` varchar(32),
	`actkey` varchar(32) NOT NULL,
	`status` enum('0','1','2','3') NOT NULL DEFAULT '0',
	`is_verified` enum('0','1') NOT NULL DEFAULT '0',
	`is_verified_mobile` enum('0','1') NOT NULL DEFAULT '0',
	`login_type` enum('normal','facebook','twitter','salon_partner','salon_user') NOT NULL DEFAULT 'normal',
	`account_created_date` datetime,
	`current_login` datetime,
	`last_login_date` datetime,
	`ip_address` varchar(25) NOT NULL,
	`is_blocked` enum('0','1') NOT NULL DEFAULT '0',
	`block_time` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`number_of_login_try` int NOT NULL DEFAULT 0,
	`replied` enum('Y','N') NOT NULL DEFAULT 'N',
	`salon_type` enum('salon','home_service'),
	`customer_type` enum('1','2'),
	`salon_name` varchar(100),
	`salon_logo` varchar(100),
	`app_id` varchar(255),
	`device_id` text,
	`app_type` varchar(255),
	`login_otp` varchar(6),
	`is_otp_verified` enum('0','1') NOT NULL DEFAULT '0',
	`login_date_time` datetime,
	CONSTRAINT `wl_customers_customer_id` PRIMARY KEY(`customer_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_disputes` (
	`dispute_id` int AUTO_INCREMENT NOT NULL,
	`salon_id` int NOT NULL,
	`related_type` enum('booking','order'),
	`related_id` int NOT NULL DEFAULT 0,
	`dispute_subject` varchar(150) NOT NULL,
	`dispute_description` text NOT NULL,
	`status` enum('1','2','3','4') NOT NULL DEFAULT '1',
	`admin_response` text,
	`admin_id` int NOT NULL DEFAULT 0,
	`dispute_resolved_date` datetime,
	`dispute_added_date` datetime,
	`dispute_updated_date` datetime,
	CONSTRAINT `wl_disputes_dispute_id` PRIMARY KEY(`dispute_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_durations` (
	`duration_id` int AUTO_INCREMENT NOT NULL,
	`duration_name` varchar(80) NOT NULL DEFAULT '',
	`duration_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`duration_date_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`sort_order` int,
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	CONSTRAINT `wl_durations_duration_id` PRIMARY KEY(`duration_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_employees` (
	`employee_id` int AUTO_INCREMENT NOT NULL,
	`salon_id` int NOT NULL,
	`employee_name` varchar(100) NOT NULL,
	`designation` varchar(100) NOT NULL,
	`salary` decimal(10,2) NOT NULL DEFAULT '0.00',
	`employee_image` varchar(255),
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`employee_added_date` datetime,
	`employee_updated_date` datetime,
	CONSTRAINT `wl_employees_employee_id` PRIMARY KEY(`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_enquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('1','2','3') NOT NULL DEFAULT '1',
	`entity_name` varchar(255),
	`entity_id` int DEFAULT 0,
	`center_id` int NOT NULL DEFAULT 0,
	`customer_id` int NOT NULL DEFAULT 0,
	`email` varchar(80) NOT NULL,
	`first_name` varchar(30) NOT NULL,
	`last_name` varchar(30) NOT NULL,
	`company_name` varchar(60),
	`country` varchar(200),
	`state` varchar(50),
	`city` varchar(50),
	`phone_number` varchar(20),
	`ext_number` varchar(50),
	`mobile_number` varchar(20),
	`fax_number` varchar(30),
	`address` varchar(220),
	`zipcode` varchar(10),
	`requirement` text,
	`message` text NOT NULL,
	`status` enum('1','2') NOT NULL,
	`reply_status` enum('Y','N') NOT NULL DEFAULT 'N',
	`receive_date` datetime NOT NULL,
	`job_title` varchar(50),
	`inquiry_type` varchar(80),
	`resume` varchar(100),
	`reply_subject` varchar(200),
	`reply_message` text,
	`reply_date` datetime,
	`last_message_date` datetime,
	`salon_deleted` enum('0','1') NOT NULL DEFAULT '0',
	`salon_deleted_date` datetime,
	`forwarded_by` int NOT NULL DEFAULT 0,
	`forwarded_from` int NOT NULL DEFAULT 0,
	`forwarded_date` datetime,
	CONSTRAINT `wl_enquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_enquiry_messages` (
	`message_id` int AUTO_INCREMENT NOT NULL,
	`enquiry_id` int NOT NULL,
	`sender_type` enum('customer','salon') NOT NULL,
	`sender_id` int NOT NULL DEFAULT 0,
	`message` text NOT NULL,
	`is_read` enum('0','1') NOT NULL DEFAULT '0',
	`read_date` datetime,
	`message_added_date` datetime NOT NULL,
	CONSTRAINT `wl_enquiry_messages_message_id` PRIMARY KEY(`message_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_faq` (
	`faq_id` int AUTO_INCREMENT NOT NULL,
	`faq_parent_id` int NOT NULL DEFAULT 0,
	`faq_question` varchar(225) NOT NULL,
	`faq_answer` text NOT NULL,
	`faq_category` enum('booking','payment','refund','general') NOT NULL DEFAULT 'general',
	`sort_order` int,
	`status` enum('1','2','3') NOT NULL DEFAULT '1',
	`faq_date_added` datetime NOT NULL,
	CONSTRAINT `wl_faq_faq_id` PRIMARY KEY(`faq_id`)
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
CREATE TABLE `wl_header_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`header_image` varchar(200) NOT NULL,
	`header_url` varchar(255),
	`line_one` varchar(100),
	`line_two` varchar(150),
	`status` enum('1','0','2') NOT NULL,
	`added_date` datetime NOT NULL,
	CONSTRAINT `wl_header_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_invite_friends` (
	`invite_id` int NOT NULL,
	`friend_name` varchar(100) NOT NULL,
	`friend_email` varchar(100) NOT NULL,
	`your_name` varchar(100) NOT NULL,
	`your_email` varchar(100) NOT NULL,
	`receive_date` datetime NOT NULL,
	CONSTRAINT `wl_invite_friends_invite_id` PRIMARY KEY(`invite_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_localities` (
	`location_id` int AUTO_INCREMENT NOT NULL,
	`city_id` int NOT NULL DEFAULT 0,
	`state_id` int NOT NULL DEFAULT 0,
	`country_id` int NOT NULL DEFAULT 0,
	`title` varchar(80),
	`created_at` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`status` char(1) NOT NULL DEFAULT '1',
	CONSTRAINT `wl_localities_location_id` PRIMARY KEY(`location_id`)
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
CREATE TABLE `wl_meta_tags` (
	`meta_id` int AUTO_INCREMENT NOT NULL,
	`is_fixed` enum('Y','N') NOT NULL DEFAULT 'N',
	`entity_type` varchar(80),
	`entity_id` int NOT NULL DEFAULT 0,
	`page_url` varchar(200) NOT NULL,
	`meta_title` varchar(80) NOT NULL,
	`meta_description` varchar(220) NOT NULL,
	`meta_keyword` varchar(460),
	`status` enum('0','1') NOT NULL DEFAULT '1',
	CONSTRAINT `wl_meta_tags_meta_id` PRIMARY KEY(`meta_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_newsletter_group_subscriber` (
	`group_subscriber_id` int NOT NULL,
	`newsletter_groups_id` int NOT NULL,
	`subscriber_id` int NOT NULL,
	`date_added` datetime NOT NULL,
	CONSTRAINT `wl_newsletter_group_subscriber_group_subscriber_id` PRIMARY KEY(`group_subscriber_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_newsletter_groups` (
	`newsletter_groups_id` int NOT NULL,
	`group_name` varchar(40) NOT NULL,
	`status` enum('1','0') NOT NULL DEFAULT '1',
	`groups_created_date` datetime NOT NULL,
	CONSTRAINT `wl_newsletter_groups_newsletter_groups_id` PRIMARY KEY(`newsletter_groups_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_newsletter_log` (
	`id` int NOT NULL,
	`newsletter_data` longtext NOT NULL,
	`posted_date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_newsletter_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_newsletters` (
	`subscriber_id` int AUTO_INCREMENT NOT NULL,
	`subscriber_name` varchar(32),
	`subscriber_email` varchar(80),
	`status` enum('0','1','2') DEFAULT '1',
	`mail_status` enum('1','0') DEFAULT '0',
	`subscribe_date` datetime,
	`mail_sent_date` datetime,
	CONSTRAINT `wl_newsletters_subscriber_id` PRIMARY KEY(`subscriber_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_order_packages` (
	`order_item_id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL DEFAULT 0,
	`package_id` int,
	`package_duration` varchar(70),
	`package_name` varchar(100),
	`package_image` longblob,
	`package_price` float(10,2),
	`quantity` int NOT NULL DEFAULT 1,
	`coupon_code` varchar(40),
	`coupon_discount` float(10,2) NOT NULL DEFAULT 0,
	CONSTRAINT `wl_order_packages_order_item_id` PRIMARY KEY(`order_item_id`)
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
CREATE TABLE `wl_orders` (
	`order_id` int AUTO_INCREMENT NOT NULL,
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
	CONSTRAINT `wl_orders_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_packages_media` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`package_id` int unsigned NOT NULL DEFAULT 0,
	`media_type` enum('photo','video','pdf') NOT NULL DEFAULT 'photo',
	`media` varchar(255),
	`is_default` enum('Y','N') NOT NULL DEFAULT 'N',
	`media_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_packages_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_packages` (
	`package_id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL DEFAULT 0,
	`category_links` varchar(80),
	`package_name` varchar(100),
	`friendly_url` varchar(110),
	`package_code` varchar(64),
	`package_type` enum('1','2') NOT NULL DEFAULT '1',
	`duration_id` int NOT NULL DEFAULT 0,
	`package_price` float(15,2) NOT NULL DEFAULT 0,
	`package_discounted_price` float(15,2) NOT NULL DEFAULT 0,
	`package_description` text,
	`is_featured` enum('1','0') NOT NULL DEFAULT '0',
	`is_popular` enum('1','0') NOT NULL DEFAULT '0',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`package_added_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`package_updated_date` datetime DEFAULT '0000-00-00 00:00:00',
	`package_viewed` int unsigned NOT NULL DEFAULT 0,
	`package_alt` varchar(100),
	CONSTRAINT `wl_packages_package_id` PRIMARY KEY(`package_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_portfolios` (
	`portfolio_id` int AUTO_INCREMENT NOT NULL,
	`portfolio_title` varchar(90),
	`friendly_url` varchar(100) NOT NULL,
	`portfolio_image` varchar(50),
	`portfolio_description` longtext,
	`sort_order` int,
	`is_home` tinyint NOT NULL DEFAULT 0,
	`status` tinyint NOT NULL DEFAULT 1,
	`portfolio_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`portfolio_date_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_portfolios_portfolio_id` PRIMARY KEY(`portfolio_id`)
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
CREATE TABLE `wl_refunds` (
	`refund_id` int AUTO_INCREMENT NOT NULL,
	`salon_id` int NOT NULL,
	`customer_id` int NOT NULL DEFAULT 0,
	`source_type` enum('booking','order') NOT NULL,
	`source_id` int NOT NULL,
	`reference_number` varchar(30) NOT NULL DEFAULT '',
	`customer_name` varchar(100),
	`refund_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`refund_to` enum('wallet','bank_account','source') NOT NULL DEFAULT 'source',
	`status` enum('pending','processed') NOT NULL DEFAULT 'pending',
	`transaction_slip` varchar(255),
	`transaction_reference` varchar(100),
	`refund_note` text,
	`refund_processed_date` datetime,
	`refund_added_date` datetime,
	`refund_updated_date` datetime,
	CONSTRAINT `wl_refunds_refund_id` PRIMARY KEY(`refund_id`),
	CONSTRAINT `uq_refunds_source` UNIQUE(`source_type`,`source_id`)
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
CREATE TABLE `wl_salons` (
	`salon_id` int AUTO_INCREMENT NOT NULL,
	`salon_name` varchar(90),
	`salon_image` varchar(50),
	`city_id` int DEFAULT 0,
	`location_id` int NOT NULL DEFAULT 0,
	`sort_order` int,
	`status` tinyint NOT NULL DEFAULT 1,
	`salon_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`salon_date_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	CONSTRAINT `wl_salons_salon_id` PRIMARY KEY(`salon_id`)
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
	`service_discounted_price` decimal(10,2),
	`is_popular` enum('1','0') NOT NULL DEFAULT '0',
	`status` enum('1','0','2') NOT NULL DEFAULT '1',
	`service_added_date` datetime,
	`service_updated_date` datetime,
	CONSTRAINT `wl_services_service_id` PRIMARY KEY(`service_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_sessions` (
	`id` varchar(128) NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`timestamp` int unsigned NOT NULL DEFAULT 0,
	`data` blob NOT NULL,
	CONSTRAINT `wl_sessions_id_ip_address` PRIMARY KEY(`id`,`ip_address`)
);
--> statement-breakpoint
CREATE TABLE `wl_student_results` (
	`result_id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL DEFAULT 0,
	`center_id` int NOT NULL DEFAULT 0,
	`course_id` int NOT NULL DEFAULT 0,
	`total_marks` int NOT NULL DEFAULT 0,
	`student_marks` int NOT NULL DEFAULT 0,
	`certificate` varchar(80),
	`marksheet` varchar(80),
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`result_added_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`result_updated_date` datetime DEFAULT '0000-00-00 00:00:00',
	`certificate_uploaded_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`marksheet_uploaded_date` datetime,
	CONSTRAINT `wl_student_results_result_id` PRIMARY KEY(`result_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_students` (
	`student_id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL DEFAULT 0,
	`category_id` int NOT NULL DEFAULT 0,
	`course_id` int NOT NULL DEFAULT 0,
	`registration_number` varchar(40),
	`doj` date,
	`student_name` varchar(200),
	`mother_name` varchar(50),
	`father_name` varchar(50),
	`email_id` varchar(80),
	`dob` varchar(20),
	`mobile_number` varchar(20),
	`address` varchar(255),
	`city_id` int NOT NULL DEFAULT 0,
	`location_id` int NOT NULL DEFAULT 0,
	`student_image` varchar(80),
	`duration_id` int NOT NULL DEFAULT 0,
	`paid_amount` float(15,2) NOT NULL DEFAULT 0,
	`payment_type` varchar(20),
	`other_details` text,
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`student_added_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`student_updated_date` datetime DEFAULT '0000-00-00 00:00:00',
	`id_card` varchar(80),
	`id_card_uploaded_date` datetime,
	CONSTRAINT `wl_students_student_id` PRIMARY KEY(`student_id`)
);
--> statement-breakpoint
CREATE TABLE `wl_testimonials` (
	`testimonial_id` int AUTO_INCREMENT NOT NULL,
	`testimonial_title` varchar(150),
	`poster_name` varchar(30),
	`friendly_url` varchar(100),
	`email` varchar(80),
	`testimonial_description` text,
	`photo` varchar(255),
	`posted_date` datetime,
	`status` enum('1','0') NOT NULL DEFAULT '0',
	CONSTRAINT `wl_testimonials_testimonial_id` PRIMARY KEY(`testimonial_id`)
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
ALTER TABLE `wl_booking_slots` ADD CONSTRAINT `wl_booking_slots_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_service_id_wl_services_service_id_fk` FOREIGN KEY (`service_id`) REFERENCES `wl_services`(`service_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `wl_bookings_slot_id_wl_booking_slots_slot_id_fk` FOREIGN KEY (`slot_id`) REFERENCES `wl_booking_slots`(`slot_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaint_replies` ADD CONSTRAINT `wl_complaint_replies_complaint_id_wl_complaints_complaint_id_fk` FOREIGN KEY (`complaint_id`) REFERENCES `wl_complaints`(`complaint_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaint_replies` ADD CONSTRAINT `wl_complaint_replies_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaints` ADD CONSTRAINT `wl_complaints_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_complaints` ADD CONSTRAINT `wl_complaints_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_customer_bank_details` ADD CONSTRAINT `wl_customer_bank_details_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_disputes` ADD CONSTRAINT `wl_disputes_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_employees` ADD CONSTRAINT `wl_employees_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_enquiry_messages` ADD CONSTRAINT `wl_enquiry_messages_enquiry_id_wl_enquiries_id_fk` FOREIGN KEY (`enquiry_id`) REFERENCES `wl_enquiries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_favorite_services` ADD CONSTRAINT `wl_favorite_services_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_favorite_services` ADD CONSTRAINT `wl_favorite_services_service_id_wl_services_service_id_fk` FOREIGN KEY (`service_id`) REFERENCES `wl_services`(`service_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referral_codes` ADD CONSTRAINT `wl_referral_codes_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referrals` ADD CONSTRAINT `wl_referrals_referrer_id_wl_customers_customer_id_fk` FOREIGN KEY (`referrer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_referrals` ADD CONSTRAINT `wl_referrals_referred_id_wl_customers_customer_id_fk` FOREIGN KEY (`referred_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_refunds` ADD CONSTRAINT `wl_refunds_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_wallet_transactions` ADD CONSTRAINT `wl_wallet_transactions_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_booking_slots_customer_date` ON `wl_booking_slots` (`customer_id`,`slot_date`);--> statement-breakpoint
CREATE INDEX `idx_bookings_customer_id` ON `wl_bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_employee_id` ON `wl_bookings` (`employee_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_salon_id` ON `wl_bookings` (`salon_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_slot_customer` ON `wl_bookings` (`slot_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_salon_requests` ON `wl_bookings` (`salon_id`,`cancel_status`,`reschedule_status`);--> statement-breakpoint
CREATE INDEX `idx_cancel_reasons_status` ON `wl_cancel_reasons` (`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `friendly_url` ON `wl_cms_pages` (`friendly_url`);--> statement-breakpoint
CREATE INDEX `idx_complaint_replies_complaint_id` ON `wl_complaint_replies` (`complaint_id`);--> statement-breakpoint
CREATE INDEX `idx_complaints_customer_id` ON `wl_complaints` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_complaints_salon_id` ON `wl_complaints` (`salon_id`);--> statement-breakpoint
CREATE INDEX `IDX_COUNTRIES_NAME` ON `wl_countries` (`country_name`);--> statement-breakpoint
CREATE INDEX `idx_disputes_salon_id` ON `wl_disputes` (`salon_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_disputes_related` ON `wl_disputes` (`related_type`,`related_id`);--> statement-breakpoint
CREATE INDEX `idx_mfg_name_zen` ON `wl_durations` (`duration_name`);--> statement-breakpoint
CREATE INDEX `idx_employees_salon_status` ON `wl_employees` (`salon_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_salon` ON `wl_enquiries` (`inquiry_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_forwarded` ON `wl_enquiries` (`forwarded_from`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_customer` ON `wl_enquiries` (`customer_id`,`inquiry_type`);--> statement-breakpoint
CREATE INDEX `idx_enquiry_messages_enquiry` ON `wl_enquiry_messages` (`enquiry_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiry_messages_unread` ON `wl_enquiry_messages` (`enquiry_id`,`sender_type`,`is_read`);--> statement-breakpoint
CREATE INDEX `idx_favorite_services_service_id` ON `wl_favorite_services` (`service_id`);--> statement-breakpoint
CREATE INDEX `entity_id` ON `wl_meta_tags` (`entity_id`);--> statement-breakpoint
CREATE INDEX `entity_type` ON `wl_meta_tags` (`entity_type`);--> statement-breakpoint
CREATE INDEX `page_url` ON `wl_meta_tags` (`page_url`);--> statement-breakpoint
CREATE INDEX `order_id` ON `wl_order_packages` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `order_no` ON `wl_order_packages` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_products_images_products_id` ON `wl_packages_media` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_referrals_referrer_id` ON `wl_referrals` (`referrer_id`);--> statement-breakpoint
CREATE INDEX `idx_refunds_salon_status` ON `wl_refunds` (`salon_id`,`status`,`refund_added_date`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `wl_reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_review_for` ON `wl_reviews` (`review_type`,`review_for_id`);--> statement-breakpoint
CREATE INDEX `idx_services_media_service_id` ON `wl_services_media` (`service_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_id` ON `wl_services` (`customer_id`);--> statement-breakpoint
CREATE INDEX `ci_sessions_timestamp` ON `wl_sessions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_wallet_transactions_customer_id` ON `wl_wallet_transactions` (`customer_id`);