const { mysqlTable, mysqlEnum, primaryKey, index, int, text, datetime } = require("drizzle-orm/mysql-core")
const { wlCustomers } = require("./wl-customers")
const { wlComplaints } = require("./wl-complaints")

const wlComplaintReplies = mysqlTable("wl_complaint_replies", {
	replyId: int("reply_id").autoincrement().notNull(),
	complaintId: int("complaint_id").notNull().references(() => wlComplaints.complaintId, { onDelete: 'cascade' }),   // wl_complaints
	customerId: int("customer_id").notNull().references(() => wlCustomers.customerId),     // wl_customers, who sent the reply
	customerType: mysqlEnum("customer_type", ['1','2']).notNull(),                  // 1=Salon Partner, 2=User
	replyMessage: text("reply_message").notNull(),
	replyAddedDate: datetime("reply_added_date", { mode: 'string'}),
},
(table) => [
	index("idx_complaint_replies_complaint_id").on(table.complaintId),
	primaryKey({ columns: [table.replyId], name: "wl_complaint_replies_reply_id"}),
])

module.exports = { wlComplaintReplies }
