-- Nearby Salons: coordinates on wl_customers_address_book (salon addresses and customer locations).
-- Run before uploading the code.
--
-- The live table already has `longitude` decimal(10,7) (empty, unused), so it is reused rather than duplicated.
-- Only `latitude` is added, with the same precision (about 1 cm). Both stay nullable: existing rows keep NULL
-- until their address is saved again (salons: geocoded on /address/add and /profile/update).
-- The unused `altitude` column is left as it is.
ALTER TABLE `wl_customers_address_book`
    ADD COLUMN `latitude` decimal(10,7) NULL DEFAULT NULL AFTER `support_number`;

-- One address per customer is looked up by customer (default first) for every salon in a search
ALTER TABLE `wl_customers_address_book`
    ADD KEY `idx_address_book_customer` (`customer_id`, `default_status`),
    -- Bounding-box filter of the nearby search (latitude range first, then longitude)
    ADD KEY `idx_address_book_coordinates` (`latitude`, `longitude`);
