const { mysqlTable, mysqlEnum, primaryKey, uniqueIndex, int, varchar, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

// A customer's bank details (one row per customer), kept apart from the profile in wl_customers
const wlCustomerBankDetails = mysqlTable('wl_customer_bank_details', {
	bankDetailId: int('bank_detail_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the owner
	accountHolderName: varchar('account_holder_name', { length: 100 }),
	bankName: varchar('bank_name', { length: 100 }),
	accountNumber: varchar('account_number', { length: 20 }),                               // 9-18 digits
	ifscCode: varchar('ifsc_code', { length: 11 }),                                         // e.g. SBIN0001234
	branchName: varchar('branch_name', { length: 100 }),
	accountType: mysqlEnum('account_type', ['savings','current']),
	upiId: varchar('upi_id', { length: 100 }),                                              // e.g. salon@okhdfcbank
	bankDetailAddedDate: datetime('bank_detail_added_date', { mode: 'string'}),
	bankDetailUpdatedDate: datetime('bank_detail_updated_date', { mode: 'string'}),
},
(table) => [
	uniqueIndex('uq_customer_bank_details_customer_id').on(table.customerId),
	primaryKey({ columns: [table.bankDetailId], name: 'wl_customer_bank_details_bank_detail_id'}),
])

module.exports = { wlCustomerBankDetails }
