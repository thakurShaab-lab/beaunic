-- FAQ tabs on Help & Support (/api/support/details): Booking Help, Payment Help, Refund Help
-- Run once on the beaunic database. Existing FAQs become 'general' until set to a tab.
ALTER TABLE `wl_faq`
  ADD COLUMN `faq_category` enum('booking','payment','refund','general') NOT NULL DEFAULT 'general' COMMENT 'Help & Support tab: booking = Booking Help, payment = Payment Help, refund = Refund Help, general = not on a tab' AFTER `faq_answer`;
