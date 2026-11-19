const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, text, datetime, decimal } = require("drizzle-orm/mysql-core");

const wlCustomersAddressBook = mysqlTable("wl_customers_address_book", {
	addressId: int("address_id").autoincrement().notNull(),
	customerId: int("customer_id").notNull(),
	firstName: varchar("first_name", { length: 40 }),
	lastName: varchar("last_name", { length: 40 }),
	name: varchar({ length: 32 }),
	address: varchar({ length: 200 }),
	mobile: varchar({ length: 25 }),
	zipcode: varchar({ length: 25 }),
	phone: varchar({ length: 25 }),
	fax: varchar({ length: 50 }),
	landmark: varchar({ length: 150 }),
	city: varchar({ length: 50 }),
	state: varchar({ length: 50 }),
	country: varchar({ length: 80 }),
	recivDate: datetime("reciv_date", { mode: 'string'}).notNull(),
	addressType: mysqlEnum("address_type", ['Bill','Ship']).notNull(),
	defaultStatus: mysqlEnum("default_status", ['Y','N']).default('N').notNull(),
	additionalNumbers: text("additional_numbers"),                                  // Mew Field    // Comma-separated extra contact numbers
	supportNumber: varchar("support_number", { length: 25 }),                       // Mew Field    // Customer support number
	// Where the address is (drizzle/migrations/0029). Salons: geocoded from the address when it is saved;
	// customers: their GPS location or the geocoded address. NULL = not known (never searched as a salon).
	latitude: decimal({ precision: 10, scale: 7 }),
	longitude: decimal({ precision: 10, scale: 7 }),
},
(table) => [
	primaryKey({ columns: [table.addressId], name: "wl_customers_address_book_address_id"}),
	index("idx_address_book_customer").on(table.customerId, table.defaultStatus),
	index("idx_address_book_coordinates").on(table.latitude, table.longitude),
]);

module.exports = { wlCustomersAddressBook };
