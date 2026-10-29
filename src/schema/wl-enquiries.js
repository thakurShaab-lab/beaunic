const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlEnquiries = mysqlTable("wl_enquiries", {
	id: int().autoincrement().notNull(),
	type: mysqlEnum(['1','2','3']).default('1').notNull(),
	entityName: varchar("entity_name", { length: 255 }),
	entityId: int("entity_id").default(0),
	centerId: int("center_id").default(0).notNull(),
	email: varchar({ length: 80 }).notNull(),
	firstName: varchar("first_name", { length: 30 }).notNull(),
	lastName: varchar("last_name", { length: 30 }).notNull(),
	companyName: varchar("company_name", { length: 60 }),
	country: varchar({ length: 200 }),
	state: varchar({ length: 50 }),
	city: varchar({ length: 50 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	extNumber: varchar("ext_number", { length: 50 }),
	mobileNumber: varchar("mobile_number", { length: 20 }),
	faxNumber: varchar("fax_number", { length: 30 }),
	address: varchar({ length: 220 }),
	zipcode: varchar({ length: 10 }),
	requirement: text(),
	message: text().notNull(),
	status: mysqlEnum(['1','2']).notNull(),
	replyStatus: mysqlEnum("reply_status", ['Y','N']).default('N').notNull(),
	receiveDate: datetime("receive_date", { mode: 'string'}).notNull(),
	jobTitle: varchar("job_title", { length: 50 }),
	inquiryType: varchar("inquiry_type", { length: 80 }),
	resume: varchar({ length: 100 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_enquiries_id"}),
]);

module.exports = { wlEnquiries };
