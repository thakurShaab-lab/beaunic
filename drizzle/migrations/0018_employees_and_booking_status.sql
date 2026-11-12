-- Employees (/api/employee/*), assigning bookings to them, and the partner's booking status updates
-- (/api/booking/partner/details, /api/booking/partner/status).
-- Run once on the beaunic database BEFORE deploying the code that uses it.
-- The live database already has a wl_employees table with these columns (checked 12 Nov 2026), so the
-- CREATE is skipped there; it's kept for fresh databases.
CREATE TABLE IF NOT EXISTS `wl_employees` (
  `employee_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique employee ID',
  `salon_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (Salon Partner, customer_type 1, the employee works for)',
  `employee_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Employee Name',
  `designation` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Designation, e.g. Hair Stylist',
  `salary` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Salary per month',
  `employee_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Photo file in uploaded_files/employee',
  `status` enum('1','0','2') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Status: 1 = Active, 0 = Inactive, 2 = Deleted',
  `employee_added_date` datetime DEFAULT NULL,
  `employee_updated_date` datetime DEFAULT NULL,
  PRIMARY KEY (`employee_id`),
  KEY `idx_employees_salon_status` (`salon_id`, `status`),
  CONSTRAINT `wl_employees_salon_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Salon partners'' employees';

ALTER TABLE `wl_bookings`
  ADD COLUMN `employee_id` int DEFAULT NULL COMMENT 'Assigned employee - References wl_employees' AFTER `booking_updated_date`,
  ADD COLUMN `employee_assigned_date` datetime DEFAULT NULL COMMENT 'When the employee was (last) assigned' AFTER `employee_id`,
  ADD COLUMN `booking_completed_date` datetime DEFAULT NULL COMMENT 'When the salon marked the booking Completed' AFTER `employee_assigned_date`,
  ADD COLUMN `cancelled_by` enum('customer','salon') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Who cancelled: customer (request approved) or salon' AFTER `booking_completed_date`,
  ADD KEY `idx_bookings_employee_id` (`employee_id`);

-- Bookings already cancelled through an approved customer request
UPDATE `wl_bookings` SET `cancelled_by` = 'customer' WHERE `is_cancel` = '1' AND `cancel_status` = 'approved' AND `cancelled_by` IS NULL;
