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
ALTER TABLE `wl_services` MODIFY COLUMN `is_popular` enum('1','0') NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `cancel_reason_id` int;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `reschedule_reason` text;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `payment_transaction_id` varchar(100);--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `employee_id` int;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `employee_assigned_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `booking_completed_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD `cancelled_by` enum('customer','salon');--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `customer_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `reply_subject` varchar(200);--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `reply_message` text;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `reply_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `last_message_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `salon_deleted` enum('0','1') DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `salon_deleted_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `forwarded_by` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `forwarded_from` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wl_enquiries` ADD `forwarded_date` datetime;--> statement-breakpoint
ALTER TABLE `wl_services` ADD `service_discounted_price` decimal(10,2);--> statement-breakpoint
ALTER TABLE `wl_bookings` ADD CONSTRAINT `uq_bookings_payment_transaction_id` UNIQUE(`payment_transaction_id`);--> statement-breakpoint
ALTER TABLE `wl_customer_bank_details` ADD CONSTRAINT `wl_customer_bank_details_customer_id_wl_customers_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_disputes` ADD CONSTRAINT `wl_disputes_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_employees` ADD CONSTRAINT `wl_employees_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_enquiry_messages` ADD CONSTRAINT `wl_enquiry_messages_enquiry_id_wl_enquiries_id_fk` FOREIGN KEY (`enquiry_id`) REFERENCES `wl_enquiries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wl_refunds` ADD CONSTRAINT `wl_refunds_salon_id_wl_customers_customer_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers`(`customer_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_cancel_reasons_status` ON `wl_cancel_reasons` (`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_disputes_salon_id` ON `wl_disputes` (`salon_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_disputes_related` ON `wl_disputes` (`related_type`,`related_id`);--> statement-breakpoint
CREATE INDEX `idx_employees_salon_status` ON `wl_employees` (`salon_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_enquiry_messages_enquiry` ON `wl_enquiry_messages` (`enquiry_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiry_messages_unread` ON `wl_enquiry_messages` (`enquiry_id`,`sender_type`,`is_read`);--> statement-breakpoint
CREATE INDEX `idx_refunds_salon_status` ON `wl_refunds` (`salon_id`,`status`,`refund_added_date`);--> statement-breakpoint
CREATE INDEX `idx_bookings_employee_id` ON `wl_bookings` (`employee_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_salon` ON `wl_enquiries` (`inquiry_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_forwarded` ON `wl_enquiries` (`forwarded_from`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_enquiries_customer` ON `wl_enquiries` (`customer_id`,`inquiry_type`);