const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlCategories = mysqlTable("wl_categories", {
	categoryId: int("category_id").autoincrement().notNull(),
	categoryName: varchar("category_name", { length: 100 }),
	categoryLinks: varchar("category_links", { length: 255 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	categoryImage: varchar("category_image", { length: 255 }),
	categoryDescription: text("category_description"),
	parentId: int("parent_id").default(0).notNull(),
	isHome: mysqlEnum("is_home", ['1','0']).default('0').notNull(),
	isFooter: mysqlEnum("is_footer", ['0','1']).default('0').notNull(),
	isFixed: mysqlEnum("is_fixed", ['1','0']).default('0').notNull(),
	sortOrder: int("sort_order"),
	dateAdded: datetime("date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	dateModified: datetime("date_modified", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	metaTitle: varchar("meta_title", { length: 100 }),
	metaKeywords: varchar("meta_keywords", { length: 100 }),
	metaDescription: varchar("meta_description", { length: 225 }),
	categoryAlt: varchar("category_alt", { length: 200 }),
},
(table) => [
	primaryKey({ columns: [table.categoryId], name: "wl_categories_category_id"}),
]);

module.exports = { wlCategories };
