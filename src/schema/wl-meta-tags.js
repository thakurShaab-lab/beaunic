const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar } = require("drizzle-orm/mysql-core");

const wlMetaTags = mysqlTable("wl_meta_tags", {
	metaId: int("meta_id").autoincrement().notNull(),
	isFixed: mysqlEnum("is_fixed", ['Y','N']).default('N').notNull(),
	entityType: varchar("entity_type", { length: 80 }),
	entityId: int("entity_id").default(0).notNull(),
	pageUrl: varchar("page_url", { length: 200 }).notNull(),
	metaTitle: varchar("meta_title", { length: 80 }).notNull(),
	metaDescription: varchar("meta_description", { length: 220 }).notNull(),
	metaKeyword: varchar("meta_keyword", { length: 460 }),
	status: mysqlEnum(['0','1']).default('1').notNull(),
},
(table) => [
	index("entity_id").on(table.entityId),
	index("entity_type").on(table.entityType),
	index("page_url").on(table.pageUrl),
	primaryKey({ columns: [table.metaId], name: "wl_meta_tags_meta_id"}),
]);

module.exports = { wlMetaTags };
