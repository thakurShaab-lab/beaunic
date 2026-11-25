-- Run after 0031, once the offline booking APIs work on wl_bookings. Offline bookings now live in wl_bookings
-- (customer_type 'Offline'); the old table is no longer read or written by the code.
-- Check first that nothing is lost: every confirmed row's booking is in wl_bookings, and drafts were copied by 0031.
--   SELECT o.* FROM wl_offline_bookings o LEFT JOIN wl_bookings b ON b.booking_id = o.booking_id
--   WHERE o.status = 'confirmed' AND b.booking_id IS NULL;   -- must return no rows
DROP TABLE `wl_offline_bookings`;
