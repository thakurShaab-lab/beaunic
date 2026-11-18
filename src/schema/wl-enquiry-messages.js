const { mysqlTable, mysqlEnum, primaryKey, index, int, text, datetime } = require("drizzle-orm/mysql-core")
const { wlEnquiries } = require("./wl-enquiries")

// Service Enquiry chat messages (drizzle/migrations/0027)
const wlEnquiryMessages = mysqlTable("wl_enquiry_messages", {
	messageId: int("message_id").autoincrement().notNull(),
	enquiryId: int("enquiry_id").notNull().references(() => wlEnquiries.id),                // wl_enquiries.id
	senderType: mysqlEnum("sender_type", ['customer','salon']).notNull(),                    // customer = the User, salon = the Salon Partner
	senderId: int("sender_id").default(0).notNull(),                                         // wl_customers.customer_id; 0 = not known
	message: text().notNull(),
	isRead: mysqlEnum("is_read", ['0','1']).default('0').notNull(),                          // 1 = read by the other side
	readDate: datetime("read_date", { mode: 'string'}),
	messageAddedDate: datetime("message_added_date", { mode: 'string'}).notNull(),
},
(table) => [
	index("idx_enquiry_messages_enquiry").on(table.enquiryId, table.messageId),
	index("idx_enquiry_messages_unread").on(table.enquiryId, table.senderType, table.isRead),
	primaryKey({ columns: [table.messageId], name: "wl_enquiry_messages_message_id"}),
])

module.exports = { wlEnquiryMessages }
