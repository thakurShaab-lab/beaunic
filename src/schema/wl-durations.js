const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlDurations = mysqlTable("wl_durations", {
	durationId: int("duration_id").autoincrement().notNull(),
	durationName: varchar("duration_name", { length: 80 }).default('').notNull(),
	durationDateAdded: datetime("duration_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	durationDateUpdated: datetime("duration_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
},
(table) => [
	index("idx_mfg_name_zen").on(table.durationName),
	primaryKey({ columns: [table.durationId], name: "wl_durations_duration_id"}),
]);

module.exports = { wlDurations };
