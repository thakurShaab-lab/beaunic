-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
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
CREATE TABLE `wl_customers` (
	`customer_id` int AUTO_INCREMENT NOT NULL,
	`user_name` varchar(80) NOT NULL,
	`password` varchar(100) NOT NULL,
	`title` varchar(10),
	`first_name` varchar(32),
	`last_name` varchar(32),
	`gender` enum('Male','Female') DEFAULT 'Male',
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
	`service_type` enum('1','2'),
	`customer_type` enum('1','2'),
	CONSTRAINT `wl_customers_customer_id` PRIMARY KEY(`customer_id`)
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
	CONSTRAINT `wl_customers_address_book_address_id` PRIMARY KEY(`address_id`)
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
CREATE TABLE `wl_enquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('1','2','3') NOT NULL DEFAULT '1',
	`entity_name` varchar(255),
	`entity_id` int DEFAULT 0,
	`center_id` int NOT NULL DEFAULT 0,
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
	CONSTRAINT `wl_enquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wl_faq` (
	`faq_id` int AUTO_INCREMENT NOT NULL,
	`faq_parent_id` int NOT NULL DEFAULT 0,
	`faq_question` varchar(225) NOT NULL,
	`faq_answer` text NOT NULL,
	`sort_order` int,
	`status` enum('1','2','3') NOT NULL DEFAULT '1',
	`faq_date_added` datetime NOT NULL,
	CONSTRAINT `wl_faq_faq_id` PRIMARY KEY(`faq_id`)
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
CREATE TABLE `wl_packages` (
	`package_id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL DEFAULT 0,
	`category_links` varchar(80),
	`package_name` varchar(100),
	`friendly_url` varchar(110),
	`package_code` varchar(64),
	`duration_id` int NOT NULL DEFAULT 0,
	`package_price` float(15,2) NOT NULL DEFAULT 0,
	`package_discounted_price` float(15,2) NOT NULL DEFAULT 0,
	`package_description` text,
	`is_featured` enum('1','0') NOT NULL DEFAULT '0',
	`status` enum('0','1','2') NOT NULL DEFAULT '1',
	`package_added_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	`package_updated_date` datetime DEFAULT '0000-00-00 00:00:00',
	`package_viewed` int unsigned NOT NULL DEFAULT 0,
	`package_alt` varchar(100),
	CONSTRAINT `wl_packages_package_id` PRIMARY KEY(`package_id`)
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
CREATE INDEX `friendly_url` ON `wl_cms_pages` (`friendly_url`);--> statement-breakpoint
CREATE INDEX `IDX_COUNTRIES_NAME` ON `wl_countries` (`country_name`);--> statement-breakpoint
CREATE INDEX `idx_mfg_name_zen` ON `wl_durations` (`duration_name`);--> statement-breakpoint
CREATE INDEX `entity_id` ON `wl_meta_tags` (`entity_id`);--> statement-breakpoint
CREATE INDEX `entity_type` ON `wl_meta_tags` (`entity_type`);--> statement-breakpoint
CREATE INDEX `page_url` ON `wl_meta_tags` (`page_url`);--> statement-breakpoint
CREATE INDEX `order_id` ON `wl_order_packages` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `order_no` ON `wl_order_packages` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_products_images_products_id` ON `wl_packages_media` (`package_id`);--> statement-breakpoint
CREATE INDEX `ci_sessions_timestamp` ON `wl_sessions` (`timestamp`);
*/