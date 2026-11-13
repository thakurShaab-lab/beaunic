-- The User's own payment for a booking (/api/booking/pay): the payment gateway's transaction ID, or
-- "WALLET-{wl_wallet_transactions.transaction_id}" for a Beaunic Wallet payment. Unique, so one gateway payment
-- can't be used to pay for two bookings (NULLs are allowed many times).
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_bookings`
  ADD COLUMN `payment_transaction_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Gateway transaction ID, or WALLET-{wallet transaction ID}' AFTER `payment_received_date`,
  ADD UNIQUE KEY `uq_bookings_payment_transaction_id` (`payment_transaction_id`);
