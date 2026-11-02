const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, datetime } = require("drizzle-orm/mysql-core")

const wlServicesMedia = mysqlTable("wl_services_media", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	serviceId: int("service_id", { unsigned: true }).default(0).notNull(),
	mediaType: mysqlEnum("media_type", ['photo','video','pdf']).default('photo').notNull(),
	media: varchar({ length: 255 }),
	isDefault: mysqlEnum("is_default", ['Y','N']).default('N').notNull(),           // Y = cover image
	mediaDateAdded: datetime("media_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	index("idx_services_media_service_id").on(table.serviceId),
	primaryKey({ columns: [table.id], name: "wl_services_media_id"}),
])

module.exports = { wlServicesMedia }
