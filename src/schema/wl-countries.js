const { mysqlTable, primaryKey, index, int, char, varchar } = require("drizzle-orm/mysql-core");

const wlCountries = mysqlTable("wl_countries", {
	id: int().autoincrement().notNull(),
	countryName: varchar("country_name", { length: 64 }).notNull(),
	countryTempName: varchar("country_temp_name", { length: 250 }).notNull(),
	countryIsoCode2: char("country_iso_code_2", { length: 2 }),
	countryIsoCode3: char("country_iso_code_3", { length: 3 }),
	countryFlag: varchar("country_flag", { length: 80 }),
	createdBy: int("created_by").default(1).notNull(),
	status: char({ length: 1 }).default('1').notNull(),
	timeZone: varchar("TimeZone", { length: 32 }).notNull(),
	utcOffset: varchar("UTC_offset", { length: 8 }).notNull(),
},
(table) => [
	index("IDX_COUNTRIES_NAME").on(table.countryName),
	primaryKey({ columns: [table.id], name: "wl_countries_id"}),
]);

module.exports = { wlCountries };
