const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, decimal, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

const wlWalletTransactions = mysqlTable('wl_wallet_transactions', {
	transactionId: int('transaction_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull().references(() => wlCustomers.customerId),             // wl_customers, the wallet owner
	transactionType: mysqlEnum('transaction_type', ['credit','debit']).notNull(),                   // credit = money in, debit = money out
	category: mysqlEnum('category', ['cashback','refund','topup','booking_payment','order_payment']).notNull(),  // cashback, refund received, money added, paid for booking, paid for order
	amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),                               // Always positive; transaction_type gives the direction
	referenceNumber: varchar('reference_number', { length: 30 }),                                   // "ORD-71842", "BK-30102", ... shown on the row
	referenceId: int('reference_id').default(0).notNull(),                                          // wl_orders / wl_bookings / wl_referrals ID it belongs to, 0 = none
	description: varchar('description', { length: 255 }),                                           // "Wallet top-up", ...
	paymentMethod: varchar('payment_method', { length: 100 }),                                      // How money was added (top-ups)
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                                        // 1=Completed, 0=Pending, 2=Failed; only completed ones count in the balance
	transactionAddedDate: datetime('transaction_added_date', { mode: 'string'}),
},
(table) => [
	index('idx_wallet_transactions_customer_id').on(table.customerId),
	primaryKey({ columns: [table.transactionId], name: 'wl_wallet_transactions_transaction_id'}),
])

module.exports = { wlWalletTransactions }
