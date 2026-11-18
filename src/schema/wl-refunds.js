const { mysqlTable, mysqlEnum, primaryKey, uniqueIndex, index, int, varchar, text, decimal, datetime } = require("drizzle-orm/mysql-core")
const { wlCustomers } = require("./wl-customers")

// Refunds a Salon Partner owes its customers (the "Refunds" screen)
const wlRefunds = mysqlTable("wl_refunds", {
	refundId: int("refund_id").autoincrement().notNull(),
	salonId: int("salon_id").notNull().references(() => wlCustomers.customerId),         // wl_customers, the Salon Partner who pays it
	customerId: int("customer_id").default(0).notNull(),                                  // wl_customers receiving it; 0 = guest
	sourceType: mysqlEnum("source_type", ['booking','order']).notNull(),                   // booking = wl_bookings, order = an order
	sourceId: int("source_id").notNull(),
	referenceNumber: varchar("reference_number", { length: 30 }).default('').notNull(),   // "BK-24019" / "ORD-5007"
	customerName: varchar("customer_name", { length: 100 }),
	refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	refundTo: mysqlEnum("refund_to", ['wallet','bank_account','source']).default('source').notNull(),  // Wallet / Bank Account / Back to Source
	status: mysqlEnum(['pending','processed']).default('pending').notNull(),
	transactionSlip: varchar("transaction_slip", { length: 255 }),                         // File in uploaded_files/refund_slips
	transactionReference: varchar("transaction_reference", { length: 100 }),               // UTR / transaction ID
	refundNote: text("refund_note"),
	refundProcessedDate: datetime("refund_processed_date", { mode: 'string'}),
	refundAddedDate: datetime("refund_added_date", { mode: 'string'}),
	refundUpdatedDate: datetime("refund_updated_date", { mode: 'string'}),
},
(table) => [
	uniqueIndex("uq_refunds_source").on(table.sourceType, table.sourceId),
	index("idx_refunds_salon_status").on(table.salonId, table.status, table.refundAddedDate),
	primaryKey({ columns: [table.refundId], name: "wl_refunds_refund_id"}),
])

module.exports = { wlRefunds }
