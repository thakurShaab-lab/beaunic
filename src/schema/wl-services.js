const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, text, decimal, datetime } = require("drizzle-orm/mysql-core")

const wlServices = mysqlTable("wl_services", {
	serviceId: int("service_id").autoincrement().notNull(),
	customerId: int("customer_id").notNull(),                                       // wl_customers, the Salon Partner
	membershipId: int("membership_id").default(0).notNull(),                        // wl_memberships, the plan active when the service was added
	categoryId: int("category_id").default(0).notNull(),                            // wl_categories
	serviceName: varchar("service_name", { length: 100 }).notNull(),
	serviceType: mysqlEnum("salon_type", ['salon', 'home_service']),
	serviceDescription: text("service_description"),                                // New Field    // "What does this service include?"
	servicePrice: decimal("service_price", { precision: 10, scale: 2 }),            // NULL = "Price not set"
	serviceDuration: int("service_duration"),                                       // New Field    // wl_durations.duration_id; NULL = "Duration not set"
	serviceDiscountedPrice: decimal("service_discounted_price", { precision: 10, scale: 2 }),  // In the live table (PHP admin); not used by the API yet
	isPopular: mysqlEnum("is_popular", ['1','0']).default('0').notNull(),           // 1=Yes, 0=No (same order and default as the live table)
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                        // 1=Active, 0=Inactive, 2=Deleted
	serviceAddedDate: datetime("service_added_date", { mode: 'string'}),
	serviceUpdatedDate: datetime("service_updated_date", { mode: 'string'}),
},
(table) => [
	index("idx_customer_id").on(table.customerId),
	primaryKey({ columns: [table.serviceId], name: "wl_services_service_id"}),
])

module.exports = { wlServices }