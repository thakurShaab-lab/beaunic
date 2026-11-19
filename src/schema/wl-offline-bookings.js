const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, datetime } = require("drizzle-orm/mysql-core")
const { wlCustomers } = require("./wl-customers")
const { wlServices } = require("./wl-services")
const { wlBookingSlots } = require("./wl-booking-slots")
const { wlBookings } = require("./wl-bookings")

// Offline Client Order (drizzle/migrations/0028): filled in step by step by the Salon Partner;
// step 4 (Confirm) makes the wl_bookings row
const wlOfflineBookings = mysqlTable("wl_offline_bookings", {
	offlineBookingId: int("offline_booking_id").autoincrement().notNull(),
	salonId: int("salon_id").notNull().references(() => wlCustomers.customerId),           // wl_customers, the Salon Partner who owns it
	clientName: varchar("client_name", { length: 50 }).notNull(),                           // Step 1 'Client Name'
	mobileNumber: varchar("mobile_number", { length: 10 }).notNull(),                       // Step 1 'Mobile Number'
	serviceId: int("service_id").references(() => wlServices.serviceId),                    // Step 2 'Select Service'
	slotId: int("slot_id").references(() => wlBookingSlots.slotId),                         // Step 3 'Booking Date' + 'Time Slot'
	paymentMode: mysqlEnum("payment_mode", ['cash','online']),                              // Step 4 'Payment Mode'
	bookingId: int("booking_id").references(() => wlBookings.bookingId),                    // Step 4: the confirmed booking
	status: mysqlEnum(['draft','confirmed']).default('draft').notNull(),
	offlineBookingAddedDate: datetime("offline_booking_added_date", { mode: 'string'}).notNull(),
	offlineBookingUpdatedDate: datetime("offline_booking_updated_date", { mode: 'string'}).notNull(),
},
(table) => [
	index("idx_offline_bookings_salon").on(table.salonId, table.status),
	primaryKey({ columns: [table.offlineBookingId], name: "wl_offline_bookings_offline_booking_id"}),
])

module.exports = { wlOfflineBookings }
