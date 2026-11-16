const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, text, datetime } = require("drizzle-orm/mysql-core")
const { wlCustomers } = require("./wl-customers")

const wlDisputes = mysqlTable("wl_disputes", {
	disputeId: int("dispute_id").autoincrement().notNull(),
	salonId: int("salon_id").notNull().references(() => wlCustomers.customerId),        // wl_customers, the Salon Partner (customer_type 1) who raised it
	relatedType: mysqlEnum("related_type", ['booking','order']),                          // booking = wl_bookings, order = wl_order (membership order); NULL = general
	relatedId: int("related_id").default(0).notNull(),                                   // wl_bookings.booking_id or wl_order.order_id; 0 when not linked
	disputeSubject: varchar("dispute_subject", { length: 150 }).notNull(),               // "Issue Summary"
	disputeDescription: text("dispute_description").notNull(),                           // "Description"
	status: mysqlEnum(['1','2','3','4']).default('1').notNull(),                          // 1=Open, 2=In Review, 3=Resolved, 4=Rejected
	adminResponse: text("admin_response"),                                                // Admin's reply, set from the admin panel
	adminId: int("admin_id").default(0).notNull(),                                       // tbl_admin who handled it
	disputeResolvedDate: datetime("dispute_resolved_date", { mode: 'string'}),
	disputeAddedDate: datetime("dispute_added_date", { mode: 'string'}),
	disputeUpdatedDate: datetime("dispute_updated_date", { mode: 'string'}),
},
(table) => [
	index("idx_disputes_salon_id").on(table.salonId, table.status),
	index("idx_disputes_related").on(table.relatedType, table.relatedId),
	primaryKey({ columns: [table.disputeId], name: "wl_disputes_dispute_id"}),
])

module.exports = { wlDisputes }