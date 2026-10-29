const { mysqlTable, mysqlEnum, primaryKey, int, bigint, varchar, text, date, datetime } = require("drizzle-orm/mysql-core");

const tblAdmin = mysqlTable("tbl_admin", {
	adminId: int("admin_id").autoincrement().notNull(),
	adminType: mysqlEnum("admin_type", ['1','2','3']).default('2').notNull(),
	adminKey: varchar("admin_key", { length: 15 }).notNull(),
	adminName: varchar("admin_name", { length: 450 }),
	adminUsername: varchar("admin_username", { length: 50 }).notNull(),
	adminPassword: varchar("admin_password", { length: 80 }),
	adminEmail: varchar("admin_email", { length: 255 }).notNull(),
	litigationDays: int("litigation_days"),
	adminLastLogin: datetime("admin_last_login", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	address: text(),
	corporateAddress: varchar("corporate_address", { length: 255 }),
	city: varchar({ length: 100 }),
	state: varchar({ length: 100 }),
	country: varchar({ length: 100 }),
	zipcode: varchar({ length: 50 }),
	phone: varchar({ length: 50 }),
	mobile: varchar({ length: 50 }),
	fax: varchar({ length: 50 }),
	contactPerson: varchar("contact_person", { length: 50 }),
	contactPhone: varchar("contact_phone", { length: 50 }),
	contactEmail: varchar("contact_email", { length: 50 }),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	totalHits: bigint("total_hits", { mode: "number" }).default(0).notNull(),
	facebookLink: varchar("facebook_link", { length: 250 }),
	twitterLink: varchar("twitter_link", { length: 250 }),
	linkedinLink: varchar("linkedin_link", { length: 250 }),
	instagramLink: varchar("instagram_link", { length: 250 }),
	youtubeLink: varchar("youtube_link", { length: 250 }),
	googleAnalyticsId: varchar("google_analytics_id", { length: 50 }),
	googleWebCode: text("google_web_code"),
	website: varchar({ length: 255 }),
	whatsappNumber: varchar("whatsapp_number", { length: 20 }),
	whatsappMessage: varchar("whatsapp_message", { length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	postDate: date("post_date", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.adminId], name: "tbl_admin_admin_id"}),
]);

module.exports = { tblAdmin };
