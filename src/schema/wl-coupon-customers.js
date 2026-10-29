const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlCouponCustomers = mysqlTable("wl_coupon_customers", {
	id: int().autoincrement().notNull(),
	customerId: int("customer_id").notNull(),
	name: varchar({ length: 150 }),
	email: varchar({ length: 80 }),
	description: text(),
	couponId: int("coupon_id").notNull(),
	usedCount: int("used_count").default(0).notNull(),
	status: mysqlEnum(['0','1','2']).default('0').notNull(),
	receiveOn: datetime("receive_on", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_coupon_customers_id"}),
]);

module.exports = { wlCouponCustomers };
