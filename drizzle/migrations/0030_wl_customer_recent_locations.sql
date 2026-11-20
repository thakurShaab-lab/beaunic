-- "Recent Locations" on the Select Your Location screen: the locations a User (customer_type 2) chose with
-- /location/save, newest first. One row per place (uq_recent_locations_place): choosing it again moves it to the top.
-- The address book values are kept as saved, so picking a recent location sets it again without another lookup.
CREATE TABLE `wl_customer_recent_locations` (
    `recent_location_id` int NOT NULL AUTO_INCREMENT,
    `customer_id` int NOT NULL COMMENT 'wl_customers, the User',
    `place_key` varchar(191) NOT NULL COMMENT 'Same place = same key: location:<location_id> or the place name',
    `source` enum('manual','current') NOT NULL COMMENT 'manual = serviceable locations list, current = GPS',
    `location_id` int NULL DEFAULT NULL COMMENT 'wl_localities, when chosen from the list',
    `title` varchar(100) NOT NULL COMMENT 'First line, e.g. Dildarnagar',
    `subtitle` varchar(255) NULL DEFAULT NULL COMMENT 'Second line, e.g. Ghazipur, Uttar Pradesh 232326',
    `address` varchar(200) NULL DEFAULT NULL COMMENT 'wl_customers_address_book.address as saved',
    `city` varchar(50) NULL DEFAULT NULL COMMENT 'wl_customers_address_book.city as saved',
    `state` varchar(50) NULL DEFAULT NULL COMMENT 'wl_customers_address_book.state as saved (wl_cities ID or state name)',
    `country` varchar(80) NULL DEFAULT NULL COMMENT 'wl_customers_address_book.country as saved (wl_countries ID or name)',
    `zipcode` varchar(25) NULL DEFAULT NULL,
    `city_id` int NULL DEFAULT NULL COMMENT 'wl_cities',
    `country_id` int NULL DEFAULT NULL COMMENT 'wl_countries',
    `state_name` varchar(50) NULL DEFAULT NULL,
    `country_name` varchar(80) NULL DEFAULT NULL,
    `latitude` decimal(10,7) NULL DEFAULT NULL,
    `longitude` decimal(10,7) NULL DEFAULT NULL,
    `created_date` datetime NOT NULL,
    `last_used_date` datetime NOT NULL COMMENT 'When it was last chosen; the list is newest first',
    PRIMARY KEY (`recent_location_id`),
    UNIQUE KEY `uq_recent_locations_place` (`customer_id`, `place_key`),
    KEY `idx_recent_locations_customer_used` (`customer_id`, `last_used_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
