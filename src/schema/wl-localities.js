const { mysqlTable, primaryKey, int, char, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlLocalities = mysqlTable("wl_localities", {
	locationId: int("location_id").autoincrement().notNull(),
	cityId: int("city_id").default(0).notNull(),
	stateId: int("state_id").default(0).notNull(),
	countryId: int("country_id").default(0).notNull(),
	title: varchar({ length: 80 }),
	createdAt: datetime("created_at", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.locationId], name: "wl_localities_location_id"}),
]);

module.exports = { wlLocalities };
