const { mysqlTable, primaryKey, int, varchar } = require("drizzle-orm/mysql-core");

const tblAdminAllowedSections = mysqlTable("tbl_admin_allowed_sections", {
	id: int().autoincrement().notNull(),
	subadminId: int("subadmin_id").notNull(),
	secParentId: int("sec_parent_id").notNull(),
	secId: int("sec_id").notNull(),
	permission: varchar({ length: 25 }).default('1'),
	allowCategoryIds: varchar("allow_category_ids", { length: 255 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "tbl_admin_allowed_sections_id"}),
]);

module.exports = { tblAdminAllowedSections };
