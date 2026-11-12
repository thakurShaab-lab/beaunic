const { mysqlTable, mysqlEnum, primaryKey, index, int, varchar, decimal, datetime } = require('drizzle-orm/mysql-core')
const { wlCustomers } = require('./wl-customers')

// A Salon Partner's employees (/api/employee/*); bookings are assigned to them (wl_bookings.employee_id)
const wlEmployees = mysqlTable('wl_employees', {
	employeeId: int('employee_id').autoincrement().notNull(),
	salonId: int('salon_id').notNull().references(() => wlCustomers.customerId),             // wl_customers, the Salon Partner (customer_type 1) the employee works for
	employeeName: varchar('employee_name', { length: 100 }).notNull(),                      // 'Employee Name'
	designation: varchar({ length: 100 }).notNull(),                                         // 'Designation', e.g. Hair Stylist
	salary: decimal({ precision: 10, scale: 2 }).default('0.00').notNull(),                  // 'Salary', per month
	employeeImage: varchar('employee_image', { length: 255 }),                               // Photo file in uploaded_files/employee
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                                 // 1=Active, 0=Inactive, 2=Deleted
	employeeAddedDate: datetime('employee_added_date', { mode: 'string'}),
	employeeUpdatedDate: datetime('employee_updated_date', { mode: 'string'}),
},
(table) => [
	index('idx_employees_salon_status').on(table.salonId, table.status),
	primaryKey({ columns: [table.employeeId], name: 'wl_employees_employee_id'}),
])

module.exports = { wlEmployees }
