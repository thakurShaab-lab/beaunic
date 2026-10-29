const { mysqlTable, primaryKey, int, tinyint, varchar, longtext, datetime } = require("drizzle-orm/mysql-core");

const wlPortfolios = mysqlTable("wl_portfolios", {
	portfolioId: int("portfolio_id").autoincrement().notNull(),
	portfolioTitle: varchar("portfolio_title", { length: 90 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }).notNull(),
	portfolioImage: varchar("portfolio_image", { length: 50 }),
	portfolioDescription: longtext("portfolio_description"),
	sortOrder: int("sort_order"),
	isHome: tinyint("is_home").default(0).notNull(),
	status: tinyint().default(1).notNull(),
	portfolioDateAdded: datetime("portfolio_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	portfolioDateUpdated: datetime("portfolio_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.portfolioId], name: "wl_portfolios_portfolio_id"}),
]);

module.exports = { wlPortfolios };
