const { mysqlTable, mysqlEnum, primaryKey, uniqueIndex, index, int, varchar, decimal, datetime } = require('drizzle-orm/mysql-core')

// "Recent Locations" (/location/recent): the locations a User chose with /location/save, newest first
// (drizzle/migrations/0030). One row per place per customer; choosing it again moves it to the top.
const wlCustomerRecentLocations = mysqlTable('wl_customer_recent_locations', {
	recentLocationId: int('recent_location_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull(),                                   // wl_customers, the User (customer_type 2)
	placeKey: varchar('place_key', { length: 191 }).notNull(),                  // location:<location_id>, or the place name for GPS
	source: mysqlEnum(['manual', 'current']).notNull(),                         // manual = serviceable locations list, current = GPS
	locationId: int('location_id'),                                             // wl_localities, when chosen from the list
	title: varchar({ length: 100 }).notNull(),                                  // "Dildarnagar"
	subtitle: varchar({ length: 255 }),                                         // "Ghazipur, Uttar Pradesh 232326"
	// The wl_customers_address_book values as saved, so the location can be set again without another lookup
	address: varchar({ length: 200 }),
	city: varchar({ length: 50 }),
	state: varchar({ length: 50 }),                                             // wl_cities ID, or the state name
	country: varchar({ length: 80 }),                                           // wl_countries ID, or the country name
	zipcode: varchar({ length: 25 }),
	// The same place as names / IDs, for the response
	cityId: int('city_id'),
	countryId: int('country_id'),
	stateName: varchar('state_name', { length: 50 }),
	countryName: varchar('country_name', { length: 80 }),
	latitude: decimal({ precision: 10, scale: 7 }),
	longitude: decimal({ precision: 10, scale: 7 }),
	createdDate: datetime('created_date', { mode: 'string' }).notNull(),
	lastUsedDate: datetime('last_used_date', { mode: 'string' }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.recentLocationId], name: 'wl_customer_recent_locations_recent_location_id' }),
	uniqueIndex('uq_recent_locations_place').on(table.customerId, table.placeKey),
	index('idx_recent_locations_customer_used').on(table.customerId, table.lastUsedDate),
])

module.exports = { wlCustomerRecentLocations }
