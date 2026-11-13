-- Salon Partner side of "Service Enquiries" (/api/enquiry/partner/*): the partner's reply (also emailed to the
-- customer) and the partner removing an enquiry from their own list. Existing rows: no reply, not deleted.
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_enquiries`
  ADD COLUMN `reply_subject` varchar(200) COLLATE utf8mb3_unicode_ci DEFAULT NULL COMMENT 'Salon Partner reply: email subject' AFTER `resume`,
  ADD COLUMN `reply_message` text COLLATE utf8mb3_unicode_ci COMMENT 'Salon Partner reply: message' AFTER `reply_subject`,
  ADD COLUMN `reply_date` datetime DEFAULT NULL COMMENT 'When the Salon Partner replied (UTC)' AFTER `reply_message`,
  ADD COLUMN `salon_deleted` enum('0','1') COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT '0' COMMENT '1 = deleted by the Salon Partner from their list (admin still sees it)' AFTER `reply_date`,
  ADD COLUMN `salon_deleted_date` datetime DEFAULT NULL COMMENT 'When the Salon Partner deleted it (UTC)' AFTER `salon_deleted`,
  ADD KEY `idx_enquiries_salon` (`inquiry_type`, `entity_id`);
