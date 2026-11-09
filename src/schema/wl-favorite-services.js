const { mysqlTable, primaryKey, index, uniqueIndex, int, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')
const { wlServices } = require('./wl-services')

const wlFavoriteServices = mysqlTable('wl_favorite_services', {
	favoriteId: int('favorite_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the User (customer_type 2) who saved it
	serviceId: int('service_id').notNull().references(() => wlServices.serviceId),         // wl_services, the saved service
	favoriteAddedDate: datetime('favorite_added_date', { mode: 'string'}),
},
(table) => [
	uniqueIndex('uq_favorite_services_customer_service').on(table.customerId, table.serviceId),  // A service can be saved once per customer
	index('idx_favorite_services_service_id').on(table.serviceId),
	primaryKey({ columns: [table.favoriteId], name: 'wl_favorite_services_favorite_id'}),
])

module.exports = { wlFavoriteServices }