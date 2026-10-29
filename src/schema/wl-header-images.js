const { mysqlTable, mysqlEnum, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlHeaderImages = mysqlTable("wl_header_images", {
	id: int().autoincrement().notNull(),
	headerImage: varchar("header_image", { length: 200 }).notNull(),
	headerUrl: varchar("header_url", { length: 255 }),
	lineOne: varchar("line_one", { length: 100 }),
	lineTwo: varchar("line_two", { length: 150 }),
	status: mysqlEnum(['1','0','2']).notNull(),
	addedDate: datetime("added_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_header_images_id"}),
]);

module.exports = { wlHeaderImages };
