const { mysqlTable, primaryKey, index, int, varchar } = require("drizzle-orm/mysql-core");
const { blob } = require("./custom-types");

const wlSessions = mysqlTable("wl_sessions", {
	id: varchar({ length: 128 }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	timestamp: int({ unsigned: true }).default(0).notNull(),
	data: blob("data").notNull(),
},
(table) => [
	index("ci_sessions_timestamp").on(table.timestamp),
	primaryKey({ columns: [table.id, table.ipAddress], name: "wl_sessions_id_ip_address"}),
]);

module.exports = { wlSessions };
