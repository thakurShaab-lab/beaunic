const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlFaq = mysqlTable("wl_faq", {
	faqId: int("faq_id").autoincrement().notNull(),
	faqParentId: int("faq_parent_id").default(0).notNull(),
	faqQuestion: varchar("faq_question", { length: 225 }).notNull(),
	faqAnswer: text("faq_answer").notNull(),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['1','2','3']).default('1').notNull(),
	faqDateAdded: datetime("faq_date_added", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.faqId], name: "wl_faq_faq_id"}),
]);

module.exports = { wlFaq };
