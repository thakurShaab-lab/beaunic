const { mysqlTable, primaryKey, int, tinyint, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlSalons = mysqlTable("wl_salons", {
	salonId: int("salon_id").autoincrement().notNull(),
	salonName: varchar("salon_name", { length: 90 }),
	salonImage: varchar("salon_image", { length: 50 }),
	cityId: int("city_id").default(0),
	locationId: int("location_id").default(0).notNull(),
	sortOrder: int("sort_order"),
	status: tinyint().default(1).notNull(),
	salonDateAdded: datetime("salon_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	salonDateUpdated: datetime("salon_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.salonId], name: "wl_salons_salon_id"}),
]);

module.exports = { wlSalons };
