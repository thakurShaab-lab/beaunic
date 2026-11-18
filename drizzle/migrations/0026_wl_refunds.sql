-- Refunds a Salon Partner owes its customers (/api/refund/list, the "Refunds" screen).
-- A row is added when a paid booking is cancelled (the partner approves the customer's request, or cancels it).
-- Run once on the beaunic database AFTER 0024 and BEFORE deploying the code that uses it.
CREATE TABLE `wl_refunds` (
  `refund_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique refund ID',
  `salon_id` int NOT NULL COMMENT 'Salon ID - References wl_customers (Salon Partner, customer_type 1, who pays the refund)',
  `customer_id` int NOT NULL DEFAULT 0 COMMENT 'wl_customers.customer_id receiving the refund; 0 = guest',
  `source_type` enum('booking','order') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'What is refunded: booking = wl_bookings, order = an order',
  `source_id` int NOT NULL COMMENT 'wl_bookings.booking_id or the order ID',
  `reference_number` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'Shown on the card: BK-24019 / ORD-5007',
  `customer_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Customer name when the refund was raised',
  `refund_amount` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Amount to refund (what the customer paid)',
  `refund_to` enum('wallet','bank_account','source') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'source' COMMENT 'wallet = Beaunic Wallet, bank_account = Bank Account, source = Back to Source (original payment method)',
  `status` enum('pending','processed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending = to be paid, processed = paid by the salon',
  `transaction_slip` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Payment slip file in uploaded_files/refund_slips (bank transfers)',
  `transaction_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UTR / transaction ID of the refund payment',
  `refund_note` text COLLATE utf8mb4_unicode_ci COMMENT 'Note from the salon',
  `refund_processed_date` datetime DEFAULT NULL COMMENT 'When it was marked processed (UTC)',
  `refund_added_date` datetime DEFAULT NULL COMMENT 'When the refund was raised, i.e. the booking was cancelled (UTC)',
  `refund_updated_date` datetime DEFAULT NULL,
  PRIMARY KEY (`refund_id`),
  UNIQUE KEY `uq_refunds_source` (`source_type`, `source_id`),
  KEY `idx_refunds_salon_status` (`salon_id`, `status`, `refund_added_date`),
  CONSTRAINT `wl_refunds_salon_id_fk` FOREIGN KEY (`salon_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Refunds salon partners owe their customers';

-- Paid bookings already cancelled before this table existed: one pending refund each
INSERT IGNORE INTO `wl_refunds`
  (`salon_id`, `customer_id`, `source_type`, `source_id`, `reference_number`, `customer_name`, `refund_amount`, `refund_to`, `status`, `refund_added_date`, `refund_updated_date`)
SELECT
  b.`salon_id`,
  b.`customer_id`,
  'booking',
  b.`booking_id`,
  CONCAT('BK-', b.`booking_id`),
  NULLIF(TRIM(CONCAT_WS(' ', b.`first_name`, b.`last_name`)), ''),
  b.`total_amount`,
  IF(b.`refund_method` = 'wallet', 'wallet', 'source'),
  'pending',
  COALESCE(b.`booking_cancelled_date`, b.`booking_updated_date`, NOW()),
  NOW()
FROM `wl_bookings` b
JOIN `wl_customers` s ON s.`customer_id` = b.`salon_id`
WHERE (b.`is_cancel` = '1' OR b.`order_status` = 'Cancelled')
  AND b.`payment_status` = 'Paid'
  AND b.`total_amount` > 0;
