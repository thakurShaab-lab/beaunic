const { mysqlTable, primaryKey, int, longtext, timestamp } = require("drizzle-orm/mysql-core");

const wlNewsletterLog = mysqlTable("wl_newsletter_log", {
	id: int().notNull(),
	newsletterData: longtext("newsletter_data").notNull(),
	postedDate: timestamp("posted_date", { mode: 'string' }).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_newsletter_log_id"}),
]);

module.exports = { wlNewsletterLog };
