const { mysqlTable, mysqlEnum, primaryKey, index, int, decimal, float, char, varchar, text, date, time, datetime } = require("drizzle-orm/mysql-core");
const { wlCustomers } = require("./wl-customers");
const { wlServices } = require("./wl-services");
const { wlBookingSlots } = require("./wl-booking-slots");

// Same columns as wl_orders, plus the booking fields at the end
const wlBookings = mysqlTable("wl_bookings", {
	bookingId: int("booking_id").autoincrement().notNull(),
	customerId: int("customer_id").default(0).notNull().references(() => wlCustomers.customerId),  // wl_customers, the User (customer_type 2) who booked
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
	orderStatus: varchar("order_status", { length: 10 }).default('Placed').notNull(),             // Booked, Completed, Cancelled, No Show
	orderReceivedDate: datetime("order_received_date", { mode: 'string'}).default('0000-00-00 00:00:00'),  // When the booking was made
	paymentMethod: varchar("payment_method", { length: 200 }),
	paymentStatus: mysqlEnum("payment_status", ['Paid','Unpaid']).default('Unpaid').notNull(),
	// Booking fields
	salonId: int("salon_id").notNull().references(() => wlCustomers.customerId),                  // wl_customers, the Salon Partner (customer_type 1) providing the service
	serviceId: int("service_id").notNull().references(() => wlServices.serviceId),                // wl_services, the booked service
	slotId: int("slot_id").notNull().references(() => wlBookingSlots.slotId),                     // wl_booking_slots, the booked slot
	serviceName: varchar("service_name", { length: 255 }),                                        // Service name when booked
	servicePrice: decimal("service_price", { precision: 10, scale: 2 }).default('0.00').notNull(),// Service price when booked
	slotDate: date("slot_date", { mode: 'string'}).notNull(),                                     // Slot date when booked
	startTime: time("start_time").notNull(),                                                      // Slot start time when booked
	endTime: time("end_time").notNull(),                                                          // Slot end time when booked
	bookingNotes: text("booking_notes"),                                                          // Optional note from the customer
	isCancel: mysqlEnum("is_cancel", ['0','1']).default('0').notNull(),                            // 0=Not Cancelled, 1=Cancelled
	cancelReason: varchar("cancel_reason", { length: 50 }),                                        // change_of_plans, booked_by_mistake, better_time_slot, health_reasons, salon_too_far, other
	cancelReasonNote: text("cancel_reason_note"),                                                 // What the customer wrote for "Other"
	refundMethod: mysqlEnum("refund_method", ['original','wallet']),                              // original=Original payment method, wallet=Beaunic Wallet; NULL when nothing was paid
	bookingCancelledDate: datetime("booking_cancelled_date", { mode: 'string'}),
	bookingUpdatedDate: datetime("booking_updated_date", { mode: 'string'}),
},
(table) => [
	index("idx_bookings_customer_id").on(table.customerId),
	index("idx_bookings_salon_id").on(table.salonId),
	index("idx_bookings_slot_customer").on(table.slotId, table.customerId),
	primaryKey({ columns: [table.bookingId], name: "wl_bookings_booking_id"}),
]);

module.exports = { wlBookings };