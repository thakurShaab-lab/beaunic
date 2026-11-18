-- Service Enquiry chat (/api/enquiry/chat/* and the Socket.IO "enquiry:*" events).
-- Run once on the beaunic database AFTER 0026 and BEFORE deploying the code that uses it.

-- 1. Which User sent the enquiry, so they can open the chat from the app (0 = website / admin enquiry, no app chat)
ALTER TABLE `wl_enquiries`
  ADD COLUMN `customer_id` int NOT NULL DEFAULT 0 COMMENT 'wl_customers.customer_id (User) who sent it from the app; 0 = not from the app' AFTER `center_id`,
  ADD COLUMN `last_message_date` datetime DEFAULT NULL COMMENT 'When the last chat message was sent (UTC)' AFTER `reply_date`,
  ADD KEY `idx_enquiries_customer` (`customer_id`, `inquiry_type`);

-- Enquiries already sent from the app: matched to the User by the email on the enquiry
UPDATE `wl_enquiries` e
JOIN `wl_customers` c ON c.`user_name` = e.`email` AND c.`customer_type` = '2'
SET e.`customer_id` = c.`customer_id`
WHERE e.`inquiry_type` = 'Salon Enquiry' AND e.`forwarded_by` = 0 AND e.`customer_id` = 0;

-- 2. The chat messages. utf8mb4, so messages can contain emojis.
CREATE TABLE `wl_enquiry_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT COMMENT 'Unique message ID',
  `enquiry_id` int NOT NULL COMMENT 'wl_enquiries.id the message belongs to',
  `sender_type` enum('customer','salon') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'customer = the User who asked, salon = the Salon Partner',
  `sender_id` int NOT NULL DEFAULT 0 COMMENT 'wl_customers.customer_id of the sender; 0 = not known (older enquiries)',
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` enum('0','1') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT '1 = read by the other side',
  `read_date` datetime DEFAULT NULL COMMENT 'When the other side read it (UTC)',
  `message_added_date` datetime NOT NULL COMMENT 'When it was sent (UTC)',
  PRIMARY KEY (`message_id`),
  KEY `idx_enquiry_messages_enquiry` (`enquiry_id`, `message_id`),
  KEY `idx_enquiry_messages_unread` (`enquiry_id`, `sender_type`, `is_read`),
  CONSTRAINT `wl_enquiry_messages_enquiry_id_fk` FOREIGN KEY (`enquiry_id`) REFERENCES `wl_enquiries` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Service Enquiry chat messages';

-- Existing enquiries: the customer's enquiry message is the first chat message ...
INSERT INTO `wl_enquiry_messages` (`enquiry_id`, `sender_type`, `sender_id`, `message`, `is_read`, `read_date`, `message_added_date`)
SELECT e.`id`, 'customer', e.`customer_id`, e.`message`, IF(e.`reply_status` = 'Y', '1', '0'), NULL, e.`receive_date`
FROM `wl_enquiries` e
WHERE e.`inquiry_type` = 'Salon Enquiry'
ORDER BY e.`id`;

-- ... followed by the reply the partner already sent by email (if any)
INSERT INTO `wl_enquiry_messages` (`enquiry_id`, `sender_type`, `sender_id`, `message`, `is_read`, `read_date`, `message_added_date`)
SELECT e.`id`, 'salon', e.`entity_id`, e.`reply_message`, '0', NULL, e.`reply_date`
FROM `wl_enquiries` e
WHERE e.`inquiry_type` = 'Salon Enquiry' AND e.`reply_date` IS NOT NULL AND e.`reply_message` IS NOT NULL
ORDER BY e.`id`;

UPDATE `wl_enquiries`
SET `last_message_date` = COALESCE(`reply_date`, `receive_date`)
WHERE `inquiry_type` = 'Salon Enquiry';
