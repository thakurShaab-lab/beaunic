-- How long a service takes, set by the Salon Partner in Add / Edit Service (/api/service/*)
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_services`
  ADD COLUMN `service_duration` int DEFAULT NULL COMMENT 'Service duration in minutes; NULL = not set' AFTER `service_price`;
