const { mysqlTable, mysqlEnum, primaryKey, int, decimal, float, varchar, date, datetime } = require("drizzle-orm/mysql-core");

const wlCoupons = mysqlTable("wl_coupons", {
	couponId: int("coupon_id").autoincrement().notNull(),
	couponTitle: varchar("coupon_title", { length: 200 }),
	couponCode: varchar("coupon_code", { length: 10 }),
	couponType: mysqlEnum("coupon_type", ['p','f','a']).default('p').notNull(),
	couponUsage: mysqlEnum("coupon_usage", ['multiple','single']).default('single').notNull(),
	usageCount: int("usage_count").default(1).notNull(),
	couponFor: mysqlEnum("coupon_for", ['0','1']).default('0').notNull(),
	couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	maximumCouponDiscount: float("maximum_coupon_discount", { precision: 10, scale: 2 }).default(0).notNull(),
	minimumOrderAmount: decimal("minimum_order_amount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	startDate: date("start_date", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	endDate: date("end_date", { mode: 'string' }),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	dateAdded: datetime("date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.couponId], name: "wl_coupons_coupon_id"}),
]);

module.exports = { wlCoupons };
