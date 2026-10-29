const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

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
},
(table) => [
	primaryKey({ columns: [table.addressId], name: "wl_customers_address_book_address_id"}),
]);

module.exports = { wlCustomersAddressBook };
