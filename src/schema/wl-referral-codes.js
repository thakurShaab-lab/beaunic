const { mysqlTable, primaryKey, uniqueIndex, int, varchar, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

// Each customer's own referral code, made the first time they open Cashback & Refer
const wlReferralCodes = mysqlTable('wl_referral_codes', {
	referralCodeId: int('referral_code_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the code owner
	referralCode: varchar('referral_code', { length: 20 }).notNull(),                       // "BEAU-AS4821"
	referralCodeAddedDate: datetime('referral_code_added_date', { mode: 'string'}),
},
(table) => [
	uniqueIndex('uq_referral_codes_customer_id').on(table.customerId),
	uniqueIndex('uq_referral_codes_referral_code').on(table.referralCode),
	primaryKey({ columns: [table.referralCodeId], name: 'wl_referral_codes_referral_code_id'}),
])

module.exports = { wlReferralCodes }