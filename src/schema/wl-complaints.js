const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, text, datetime } = require("drizzle-orm/mysql-core")
const { wlCustomers } = require("./wl-customers")

const wlComplaints = mysqlTable("wl_complaints", {
	complaintId: int("complaint_id").autoincrement().notNull(),
	customerId: int("customer_id").notNull().references(() => wlCustomers.customerId),     // wl_customers, the User (customer_type 2) who raised it
	salonId: int("salon_id").notNull().references(() => wlCustomers.customerId),           // wl_customers, the Salon Partner (customer_type 1) it is raised against
	orderId: int("order_id").notNull(),                                             // wl_orders, the related order / booking
	complaintSubject: varchar("complaint_subject", { length: 150 }).notNull(),      // "One line about the issue"
	complaintDescription: text("complaint_description").notNull(),                  // "Describe what happened", the first message of the conversation
	status: mysqlEnum(['1','2','3','4']).default('1').notNull(),                    // 1=Pending, 2=In Progress, 3=Resolved, 4=Closed
	complaintResolvedDate: datetime("complaint_resolved_date", { mode: 'string'}),
	complaintClosedDate: datetime("complaint_closed_date", { mode: 'string'}),
	complaintAddedDate: datetime("complaint_added_date", { mode: 'string'}),
	complaintUpdatedDate: datetime("complaint_updated_date", { mode: 'string'}),
},
(table) => [
	index("idx_complaints_customer_id").on(table.customerId),
	index("idx_complaints_salon_id").on(table.salonId),
	primaryKey({ columns: [table.complaintId], name: "wl_complaints_complaint_id"}),
])

module.exports = { wlComplaints }
