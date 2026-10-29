const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlCenters = mysqlTable("wl_centers", {
	centerId: int("center_id").autoincrement().notNull(),
	centerName: varchar("center_name", { length: 90 }),
	centerCode: varchar("center_code", { length: 20 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	email: varchar({ length: 80 }),
	password: varchar({ length: 80 }),
	yoe: varchar({ length: 4 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	address: varchar({ length: 255 }),
	centerImage: varchar("center_image", { length: 50 }),
	cityId: int("city_id").default(0),
	locationId: int("location_id").default(0).notNull(),
	centerDescription: text("center_description"),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['1','0']).default('1').notNull(),
	centerDateAdded: datetime("center_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	centerDateUpdated: datetime("center_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	currentLogin: datetime("current_login", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	lastLoginDate: datetime("last_login_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.centerId], name: "wl_centers_center_id"}),
]);

module.exports = { wlCenters };
