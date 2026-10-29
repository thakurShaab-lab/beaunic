const { mysqlTable, mysqlEnum, primaryKey, int, float, char, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlCurrencies = mysqlTable("wl_currencies", {
	currencyId: int("currency_id").autoincrement().notNull(),
	title: varchar({ length: 32 }).default('').notNull(),
	code: varchar({ length: 3 }).default('').notNull(),
	symbolLeft: varchar("symbol_left", { length: 12 }).notNull(),
	symbolRight: varchar("symbol_right", { length: 12 }).notNull(),
	currImage: varchar("curr_image", { length: 250 }).notNull(),
	decimalPlace: char("decimal_place", { length: 1 }).notNull(),
	value: float({ precision: 15, scale: 8 }).notNull(),
	isDefault: mysqlEnum("is_default", ['Y','N']).default('N').notNull(),
	status: int().notNull(),
	dateModified: datetime("date_modified", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.currencyId], name: "wl_currencies_currency_id"}),
]);

module.exports = { wlCurrencies };
