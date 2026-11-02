-- Service images move to their own table, laid out like wl_packages_media
-- Run after 0001 and 0002. InnoDB so a service and its images are saved together in one transaction.
CREATE TABLE `wl_services_media` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_id` int UNSIGNED NOT NULL DEFAULT '0',
  `media_type` enum('photo','video','pdf') NOT NULL DEFAULT 'photo',
  `media` varchar(255) DEFAULT NULL,
  `is_default` enum('Y','N') NOT NULL DEFAULT 'N' COMMENT 'Y = cover image',
  `media_date_added` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`id`),
  KEY `idx_services_media_service_id` (`service_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Move any images already saved on services, then drop the old columns
INSERT INTO `wl_services_media` (`service_id`, `media_type`, `media`, `is_default`, `media_date_added`)
  SELECT `service_id`, 'photo', `service_image`, 'Y', COALESCE(`service_added_date`, NOW()) FROM `wl_services` WHERE `service_image` IS NOT NULL
  UNION ALL
  SELECT `service_id`, 'photo', `service_image_2`, 'N', COALESCE(`service_added_date`, NOW()) FROM `wl_services` WHERE `service_image_2` IS NOT NULL
  UNION ALL
  SELECT `service_id`, 'photo', `service_image_3`, 'N', COALESCE(`service_added_date`, NOW()) FROM `wl_services` WHERE `service_image_3` IS NOT NULL;

ALTER TABLE `wl_services`
  DROP `service_image`,
  DROP `service_image_2`,
  DROP `service_image_3`;
