const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlPackagesMedia = mysqlTable("wl_packages_media", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	packageId: int("package_id", { unsigned: true }).default(0).notNull(),
	mediaType: mysqlEnum("media_type", ['photo','video','pdf']).default('photo').notNull(),
	media: varchar({ length: 255 }),
	isDefault: mysqlEnum("is_default", ['Y','N']).default('N').notNull(),
	mediaDateAdded: datetime("media_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	index("idx_products_images_products_id").on(table.packageId),
	primaryKey({ columns: [table.id], name: "wl_packages_media_id"}),
]);

module.exports = { wlPackagesMedia };
