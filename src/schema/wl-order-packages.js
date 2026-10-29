const { mysqlTable, primaryKey, index, int, float, varchar } = require("drizzle-orm/mysql-core");
const { longblob } = require("./custom-types");

const wlOrderPackages = mysqlTable("wl_order_packages", {
	orderItemId: int("order_item_id").autoincrement().notNull(),
	orderId: int("order_id").default(0).notNull(),
	packageId: int("package_id"),
	packageDuration: varchar("package_duration", { length: 70 }),
	packageName: varchar("package_name", { length: 100 }),
	longblobType: longblob("package_image"),
	packagePrice: float("package_price", { precision: 10, scale: 2 }),
	quantity: int().default(1).notNull(),
	couponCode: varchar("coupon_code", { length: 40 }),
	couponDiscount: float("coupon_discount", { precision: 10, scale: 2 }).default(0).notNull(),
},
(table) => [
	index("order_id").on(table.orderItemId),
	index("order_no").on(table.orderId),
	primaryKey({ columns: [table.orderItemId], name: "wl_order_packages_order_item_id"}),
]);

module.exports = { wlOrderPackages };
