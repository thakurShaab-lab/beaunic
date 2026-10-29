const { mysqlTable, primaryKey, int, char, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlCities = mysqlTable("wl_cities", {
	cityId: int("city_id").autoincrement().notNull(),
	countryId: int("country_id").default(0).notNull(),
	title: varchar({ length: 80 }),
	createdAt: datetime("created_at", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	createdBy: int("created_by").default(1).notNull(),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.cityId], name: "wl_cities_city_id"}),
]);

module.exports = { wlCities };
