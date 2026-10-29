const { mysqlTable, mysqlEnum, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlNewsletters = mysqlTable("wl_newsletters", {
	subscriberId: int("subscriber_id").autoincrement().notNull(),
	subscriberName: varchar("subscriber_name", { length: 32 }),
	subscriberEmail: varchar("subscriber_email", { length: 80 }),
	status: mysqlEnum(['0','1','2']).default('1'),
	mailStatus: mysqlEnum("mail_status", ['1','0']).default('0'),
	subscribeDate: datetime("subscribe_date", { mode: 'string'}),
	mailSentDate: datetime("mail_sent_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.subscriberId], name: "wl_newsletters_subscriber_id"}),
]);

module.exports = { wlNewsletters };
