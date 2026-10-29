const { mysqlTable, mysqlEnum, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlNewsletterGroups = mysqlTable("wl_newsletter_groups", {
	newsletterGroupsId: int("newsletter_groups_id").notNull(),
	groupName: varchar("group_name", { length: 40 }).notNull(),
	status: mysqlEnum(['1','0']).default('1').notNull(),
	groupsCreatedDate: datetime("groups_created_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.newsletterGroupsId], name: "wl_newsletter_groups_newsletter_groups_id"}),
]);

module.exports = { wlNewsletterGroups };
