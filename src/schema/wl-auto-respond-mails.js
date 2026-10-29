const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlAutoRespondMails = mysqlTable("wl_auto_respond_mails", {
	id: int().autoincrement().notNull(),
	emailSection: varchar("email_section", { length: 80 }).notNull(),
	emailSubject: varchar("email_subject", { length: 200 }).notNull(),
	emailContent: text("email_content").notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	updatedOn: datetime("updated_on", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_auto_respond_mails_id"}),
]);

module.exports = { wlAutoRespondMails };
