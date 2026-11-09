-- Beaunic Wallet and Cashback & Refer (/api/wallet/*, /api/referral/*)
-- Run once on the beaunic database before using these APIs.
CREATE TABLE `wl_wallet_transactions` (
  `transaction_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique wallet transaction ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (wallet owner)',
  `transaction_type` enum('credit','debit') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'credit = money in, debit = money out',
  `category` enum('cashback','refund','topup','booking_payment','order_payment') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'cashback, refund received, money added, paid for booking, paid for order',
  `amount` decimal(10,2) NOT NULL COMMENT 'Always positive; transaction_type gives the direction',
  `reference_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Shown on the row, e.g. ORD-71842, BK-30102',
  `reference_id` int NOT NULL DEFAULT '0' COMMENT 'wl_orders / wl_bookings / wl_referrals ID it belongs to, 0 = none',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. Wallet top-up',
  `payment_method` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'How money was added (top-ups)',
  `status` enum('1','0','2') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT 'Status: 1 = Completed, 0 = Pending, 2 = Failed; only completed ones count in the balance',
  `transaction_added_date` datetime DEFAULT NULL COMMENT 'Date and time of the transaction',
  PRIMARY KEY (`transaction_id`),
  KEY `idx_wallet_transactions_customer_id` (`customer_id`),
  CONSTRAINT `wl_wallet_transactions_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Beaunic Wallet credits and debits';

CREATE TABLE `wl_referral_codes` (
  `referral_code_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique ID',
  `customer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (code owner)',
  `referral_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Referral code, e.g. BEAU-AS4821',
  `referral_code_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the code was made',
  PRIMARY KEY (`referral_code_id`),
  UNIQUE KEY `uq_referral_codes_customer_id` (`customer_id`),
  UNIQUE KEY `uq_referral_codes_referral_code` (`referral_code`),
  CONSTRAINT `wl_referral_codes_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Each customer''s referral code';

CREATE TABLE `wl_referrals` (
  `referral_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique referral ID',
  `referrer_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (who shared the code)',
  `referred_id` int NOT NULL COMMENT 'Customer ID - References wl_customers (new customer who used the code)',
  `referral_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'The code used',
  `cashback_amount` decimal(10,2) DEFAULT NULL COMMENT 'Set by Beaunic; NULL until configured',
  `wallet_transaction_id` int NOT NULL DEFAULT '0' COMMENT 'wl_wallet_transactions credit once paid, 0 = not yet',
  `status` enum('pending','credited','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'Referral cashback status',
  `referral_added_date` datetime DEFAULT NULL COMMENT 'Date and time when the code was used',
  `referral_credited_date` datetime DEFAULT NULL COMMENT 'Date and time when the cashback was credited',
  PRIMARY KEY (`referral_id`),
  UNIQUE KEY `uq_referrals_referred_id` (`referred_id`),
  KEY `idx_referrals_referrer_id` (`referrer_id`),
  CONSTRAINT `wl_referrals_referrer_id_fk` FOREIGN KEY (`referrer_id`) REFERENCES `wl_customers` (`customer_id`),
  CONSTRAINT `wl_referrals_referred_id_fk` FOREIGN KEY (`referred_id`) REFERENCES `wl_customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customers who joined using a referral code';
