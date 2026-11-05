const { mysqlTable, mysqlEnum, primaryKey, index, int, tinyint, text, datetime } = require("drizzle-orm/mysql-core")

const wlReviews = mysqlTable("wl_reviews", {
	reviewId: int("review_id").autoincrement().notNull(),
	customerId: int("customer_id").notNull(),                                       // wl_customers, the User (customer_type 2) who wrote the review
	reviewType: mysqlEnum("review_type", ['salon','service','employee','product']).notNull(),      // What is being reviewed
	reviewForId: int("review_for_id").default(null),                                    // ID of the reviewed item: wl_customers (salon), wl_services (service), ...
	salonId: int("salon_id").default(0).notNull(),                                  // wl_customers, the Salon Partner the reviewed item belongs to
	rating: tinyint().notNull(),                                                    // 1 to 5 stars
	reviewText: text("review_text"),                                                // "Your review"
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                        // 1=Active, 0=Inactive, 2=Deleted
	reviewAddedDate: datetime("review_added_date", { mode: 'string'}),
	reviewUpdatedDate: datetime("review_updated_date", { mode: 'string'}),
},
(table) => [
	index("idx_reviews_customer_id").on(table.customerId),
	index("idx_reviews_review_for").on(table.reviewType, table.reviewForId),
	primaryKey({ columns: [table.reviewId], name: "wl_reviews_review_id"}),
])

module.exports = { wlReviews }