const { mysqlTable, mysqlEnum, primaryKey, index, uniqueIndex, int, varchar, decimal, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

// Who joined using whose referral code
const wlReferrals = mysqlTable('wl_referrals', {
	referralId: int('referral_id').autoincrement().notNull(),
	referrerId: int('referrer_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the code owner who shared it
	referredId: int('referred_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the new customer who used it
	referralCode: varchar('referral_code', { length: 20 }).notNull(),                       // The code used
	cashbackAmount: decimal('cashback_amount', { precision: 10, scale: 2 }),                // Set by Beaunic; NULL until configured
	walletTransactionId: int('wallet_transaction_id').default(0).notNull(),                 // wl_wallet_transactions credit once paid, 0 = not yet
	status: mysqlEnum(['pending','credited','cancelled']).default('pending').notNull(),
	referralAddedDate: datetime('referral_added_date', { mode: 'string'}),
	referralCreditedDate: datetime('referral_credited_date', { mode: 'string'}),
},
(table) => [
	uniqueIndex('uq_referrals_referred_id').on(table.referredId),                          // A customer can be referred only once
	index('idx_referrals_referrer_id').on(table.referrerId),
	primaryKey({ columns: [table.referralId], name: 'wl_referrals_referral_id'}),
])

module.exports = { wlReferrals }
