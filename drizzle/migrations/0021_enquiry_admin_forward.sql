-- Admin Enquiries (/api/enquiry/admin/send): the admin sends an enquiry to one or more Salon Partners. Each partner
-- gets their own wl_enquiries row (inquiry_type 'Salon Enquiry', entity_id = the partner), marked with the admin who
-- sent it. Existing rows: 0 = sent by the customer from the app/website, not by the admin.
-- Run once on the beaunic database BEFORE deploying the code that uses it.
ALTER TABLE `wl_enquiries`
  ADD COLUMN `forwarded_by` int NOT NULL DEFAULT 0 COMMENT 'tbl_admin.admin_id who sent it to the partner (0 = sent by the customer)' AFTER `salon_deleted_date`,
  ADD COLUMN `forwarded_from` int NOT NULL DEFAULT 0 COMMENT 'wl_enquiries.id the admin forwarded (0 = written by the admin, or not forwarded)' AFTER `forwarded_by`,
  ADD COLUMN `forwarded_date` datetime DEFAULT NULL COMMENT 'When the admin sent it (UTC)' AFTER `forwarded_from`,
  ADD KEY `idx_enquiries_forwarded` (`forwarded_from`, `entity_id`);
