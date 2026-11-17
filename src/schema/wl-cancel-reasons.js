const { mysqlTable, mysqlEnum, primaryKey, uniqueIndex, index, int, varchar, datetime } = require("drizzle-orm/mysql-core")

// "Reason for cancellation" options on the Cancel Booking screen
const wlCancelReasons = mysqlTable("wl_cancel_reasons", {
	reasonId: int("reason_id").autoincrement().notNull(),
	reasonKey: varchar("reason_key", { length: 50 }).notNull(),                              // Saved in wl_bookings.cancel_reason, e.g. change_of_plans
	reasonTitle: varchar("reason_title", { length: 100 }).default('').notNull(),              // Shown to the customer, e.g. Change of plans
	requiresNote: mysqlEnum("requires_note", ['0','1']).default('0').notNull(),               // 1 = customer must type a note (wl_bookings.cancel_reason_note), e.g. Other
	sortOrder: int("sort_order"),
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                                  // 1=Active, 0=Inactive, 2=Deleted
	reasonAddedDate: datetime("reason_added_date", { mode: 'string'}),
	reasonUpdatedDate: datetime("reason_updated_date", { mode: 'string'}),
},
(table) => [
	uniqueIndex("uq_cancel_reasons_key").on(table.reasonKey),
	index("idx_cancel_reasons_status").on(table.status, table.sortOrder),
	primaryKey({ columns: [table.reasonId], name: "wl_cancel_reasons_reason_id"}),
])

module.exports = { wlCancelReasons }
