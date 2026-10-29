const { mysqlTable, mysqlEnum, primaryKey, int, varchar, date, datetime, text } = require("drizzle-orm/mysql-core")

const wlCustomers = mysqlTable("wl_customers", {
	customerId: int("customer_id").autoincrement().notNull(),
	userName: varchar("user_name", { length: 80 }).notNull(),
	password: varchar({ length: 100 }).notNull(),
	title: varchar({ length: 10 }),
	firstName: varchar("first_name", { length: 32 }),
	lastName: varchar("last_name", { length: 32 }),
	gender: mysqlEnum(['Male', 'Female']).default('Male'),
	birthDate: date("birth_date", { mode: 'string' }),
	customerPhoto: varchar("customer_photo", { length: 32 }),
	phoneNumber: varchar("phone_number", { length: 32 }),
	mobileNumber: varchar("mobile_number", { length: 32 }),
	faxNumber: varchar("fax_number", { length: 32 }),
	actkey: varchar({ length: 32 }).notNull(),
	status: mysqlEnum(['0', '1', '2', '3']).default('0').notNull(),
	isVerified: mysqlEnum("is_verified", ['0', '1']).default('0').notNull(),
	isVerifiedMobile: mysqlEnum("is_verified_mobile", ['0', '1']).default('0').notNull(),
	loginType: mysqlEnum("login_type", ['normal', 'facebook', 'twitter', 'salon_partner', 'salon_user']).default('normal').notNull(),
	accountCreatedDate: datetime("account_created_date", { mode: 'string' }),
	currentLogin: datetime("current_login", { mode: 'string' }),
	lastLoginDate: datetime("last_login_date", { mode: 'string' }),
	ipAddress: varchar("ip_address", { length: 25 }).notNull(),
	isBlocked: mysqlEnum("is_blocked", ['0', '1']).default('0').notNull(),
	blockTime: datetime("block_time", { mode: 'string' }).default('0000-00-00 00:00:00').notNull(),
	numberOfLoginTry: int("number_of_login_try").default(0).notNull(),
	replied: mysqlEnum(['Y', 'N']).default('N').notNull(),
	serviceType: mysqlEnum("salon_type", ['salon', 'home_service']),                                // 1=Salon, 2=Home Service      // Mew Field
	customerType: mysqlEnum("customer_type", ['1', '2']),                                           // 1=Salom Partner, 2=User      // Mew Field
	salonName: varchar("salon_name", { length: 100 }),                                              // 1=Salom Partner, 2=User      // Mew Field
	salonLogo: varchar("salon_logo", { length: 100 }),                                              // 1=Salom Partner, 2=User      // Mew Field
	appId: varchar("app_id", { length: 255 }),                                                                                      // Mew Field
	deviceId: text("device_id"),                                                                                                    // Mew Field
	appType: varchar("app_type", { length: 255 }),                                                                                  // Mew Field
	loginOtp: varchar("login_otp", { length: 6 }),                                                                                  // Mew Field
	isOtpVerified: mysqlEnum("is_otp_verified", ["0", "1"]).default("0").notNull(),                                                 // Mew Field
	loginDateTime: datetime("login_date_time", { mode: 'string' }),                                                                 // Mew Field    // OTP sent time
},
	(table) => [
		primaryKey({ columns: [table.customerId], name: "wl_customers_customer_id" }),
	])

module.exports = { wlCustomers }