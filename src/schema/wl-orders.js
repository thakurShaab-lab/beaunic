const { mysqlTable, mysqlEnum, primaryKey, int, decimal, float, char, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlOrders = mysqlTable("wl_orders", {
	orderId: int("order_id").autoincrement().notNull(),
	customerId: int("customer_id").default(0).notNull(),
	customerType: varchar("customer_type", { length: 100 }).default('Member'),
	invoiceNumber: varchar("invoice_number", { length: 30 }),
	firstName: varchar("first_name", { length: 50 }),
	lastName: varchar("last_name", { length: 50 }),
	mobileNumber: varchar("mobile_number", { length: 50 }),
	phone: varchar({ length: 50 }),
	email: varchar({ length: 50 }),
	discountCouponId: int("discount_coupon_id").default(0).notNull(),
	discountCouponCode: varchar("discount_coupon_code", { length: 40 }),
	couponDiscountAmount: float("coupon_discount_amount", { precision: 10, scale: 2 }),
	totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).default('0.00'),
	vatAppliedCent: float("vat_applied_cent", { precision: 10, scale: 2 }).default(0).notNull(),
	currencyCode: char("currency_code", { length: 3 }),
	currencySymbol: char("currency_symbol", { length: 10 }),
	currencyValue: decimal("currency_value", { precision: 14, scale: 6 }).default('0.000000').notNull(),
	orderStatus: varchar("order_status", { length: 10 }).default('Placed').notNull(),
	orderReceivedDate: datetime("order_received_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	paymentMethod: varchar("payment_method", { length: 200 }),
	paymentStatus: mysqlEnum("payment_status", ['Paid','Unpaid']).default('Unpaid').notNull(),
},
(table) => [
	primaryKey({ columns: [table.orderId], name: "wl_orders_order_id"}),
]);

module.exports = { wlOrders };
