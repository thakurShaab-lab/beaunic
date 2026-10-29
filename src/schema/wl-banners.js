const { mysqlTable, mysqlEnum, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlBanners = mysqlTable("wl_banners", {
	bannerId: int("banner_id").autoincrement().notNull(),
	bannerPosition: varchar("banner_position", { length: 100 }),
	bannerImage: varchar("banner_image", { length: 200 }),
	bannerUrl: varchar("banner_url", { length: 170 }),
	bannerPage: varchar("banner_page", { length: 30 }),
	status: mysqlEnum(['1','0']).default('1'),
	clicks: int().default(0).notNull(),
	bannerAddedDate: datetime("banner_added_date", { mode: 'string'}),
	bannerStartDate: datetime("banner_start_date", { mode: 'string'}),
	bannerEndDate: datetime("banner_end_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.bannerId], name: "wl_banners_banner_id"}),
]);

module.exports = { wlBanners };
