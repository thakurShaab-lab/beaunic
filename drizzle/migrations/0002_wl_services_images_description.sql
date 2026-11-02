-- Add/Edit Service screen: up to three images (cover + 2) and a description
-- Run after 0001_wl_services.sql.
ALTER TABLE `wl_services`
  ADD `service_image_2` varchar(200) DEFAULT NULL AFTER `service_image`,
  ADD `service_image_3` varchar(200) DEFAULT NULL AFTER `service_image_2`,
  ADD `service_description` text COLLATE utf8mb3_unicode_ci AFTER `service_image_3`;
