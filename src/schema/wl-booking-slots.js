const { mysqlTable, mysqlEnum, primaryKey, index, int, date, time, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

const wlBookingSlots = mysqlTable('wl_booking_slots', {
	slotId: int('slot_id').autoincrement().notNull(),
	customerId: int('customer_id').notNull().references(() => wlCustomers.customerId),     // wl_customers, the Salon Partner (customer_type 1) offering the slot
	slotDate: date('slot_date', { mode: 'string'}).notNull(),                              // 'Choose Date'
	startTime: time('start_time').notNull(),                                               // 'Start Time'
	endTime: time('end_time').notNull(),                                                   // 'End Time'
	maxBookings: int('max_bookings').default(1).notNull(),                                 // 'Max. Bookings allowed per slot'
	bookedCount: int('booked_count').default(0).notNull(),                                 // Bookings made in this slot so far
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                               // 1=Active, 0=Inactive, 2=Deleted
	slotAddedDate: datetime('slot_added_date', { mode: 'string'}),
	slotUpdatedDate: datetime('slot_updated_date', { mode: 'string'}),
},
(table) => [
	index('idx_booking_slots_customer_date').on(table.customerId, table.slotDate),
	primaryKey({ columns: [table.slotId], name: 'wl_booking_slots_slot_id'}),
])

module.exports = { wlBookingSlots }