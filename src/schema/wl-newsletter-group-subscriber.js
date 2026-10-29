const { mysqlTable, primaryKey, int, datetime } = require("drizzle-orm/mysql-core");

const wlNewsletterGroupSubscriber = mysqlTable("wl_newsletter_group_subscriber", {
	groupSubscriberId: int("group_subscriber_id").notNull(),
	newsletterGroupsId: int("newsletter_groups_id").notNull(),
	subscriberId: int("subscriber_id").notNull(),
	dateAdded: datetime("date_added", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.groupSubscriberId], name: "wl_newsletter_group_subscriber_group_subscriber_id"}),
]);

module.exports = { wlNewsletterGroupSubscriber };
