const { mysqlTable, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlInviteFriends = mysqlTable("wl_invite_friends", {
	inviteId: int("invite_id").notNull(),
	friendName: varchar("friend_name", { length: 100 }).notNull(),
	friendEmail: varchar("friend_email", { length: 100 }).notNull(),
	yourName: varchar("your_name", { length: 100 }).notNull(),
	yourEmail: varchar("your_email", { length: 100 }).notNull(),
	receiveDate: datetime("receive_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.inviteId], name: "wl_invite_friends_invite_id"}),
]);

module.exports = { wlInviteFriends };
