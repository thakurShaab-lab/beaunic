const { mysqlTable, primaryKey, int, char, varchar } = require("drizzle-orm/mysql-core");

const tblAdminSections = mysqlTable("tbl_admin_sections", {
	id: int().autoincrement().notNull(),
	parentId: int("parent_id").default(0).notNull(),
	sectionTitle: varchar("section_title", { length: 100 }),
	sectionController: varchar("section_controller", { length: 100 }),
	dispOrder: int("disp_order").default(0).notNull(),
	actualPrivilege: varchar("actual_privilege", { length: 80 }),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "tbl_admin_sections_id"}),
]);

module.exports = { tblAdminSections };
