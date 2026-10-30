const { mysqlTable, mysqlEnum, primaryKey, int, float, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlPackages = mysqlTable("wl_packages", {
	packageId: int("package_id").autoincrement().notNull(),
	categoryId: int("category_id").default(0).notNull(),
	categoryLinks: varchar("category_links", { length: 80 }),
	packageName: varchar("package_name", { length: 100 }),
	friendlyUrl: varchar("friendly_url", { length: 110 }),
	packageCode: varchar("package_code", { length: 64 }),
	packageType: mysqlEnum('package_type', ['1', '2']).notNull().default('1'),                                          // New Field   1: Salon, 2: Home
	durationId: int("duration_id").default(0).notNull(),
	packagePrice: float("package_price", { precision: 15, scale: 2 }).default(0).notNull(),
	packageDiscountedPrice: float("package_discounted_price", { precision: 15, scale: 2 }).default(0).notNull(),
	packageDescription: text("package_description"),
	isFeatured: mysqlEnum("is_featured", ['1','0']).default('0').notNull(),
	isPopular: mysqlEnum('is_popular', ['1', '0']).notNull().default('0'),                                          // New Field
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	packageAddedDate: datetime("package_added_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	packageUpdatedDate: datetime("package_updated_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	packageViewed: int("package_viewed", { unsigned: true }).default(0).notNull(),
	packageAlt: varchar("package_alt", { length: 100 }),
},
(table) => [
	primaryKey({ columns: [table.packageId], name: "wl_packages_package_id"}),
]);

module.exports = { wlPackages };
