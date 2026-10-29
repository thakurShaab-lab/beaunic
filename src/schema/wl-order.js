const { mysqlTable, int, varchar, text, float, date, datetime, char, decimal, mysqlEnum } = require('drizzle-orm/mysql-core')
const { blob } = require('./custom-types')

const wlOrders = mysqlTable('wl_order', {
    order_id: int('order_id')
        .primaryKey()
        .autoincrement()
        .notNull(),

    order_type: int('order_type')
        .notNull()
        .default(1),

    customers_id: int('customers_id')
        .notNull()
        .default(0),

    invoice_number: varchar('invoice_number', { length: 30 })
        .notNull(),

    first_name: varchar('first_name', { length: 80 }),

    last_name: varchar('last_name', { length: 80 }),

    email: varchar('email', { length: 80 }),

    address: text('address'),

    state: varchar('state', { length: 255 }),

    phone: varchar('phone', { length: 30 }),

    mship_id: int('mship_id'),

    mship_name: varchar('mship_name', { length: 100 }),

    mship_price: float('mship_price', {
        precision: 10,
        scale: 2,
    }).default(0.00),

    mship_image: blob('mship_image', { mode: 'buffer' }),

    duration: int('duration'),

    view_leads_count: int('view_leads_count'),

    description: text('description'),

    pkg_start_date: date('pkg_start_date', {
        mode: 'string',
    }),

    pkg_end_date: date('pkg_end_date', {
        mode: 'string',
    }),

    currency_code: char('currency_code', { length: 3 })
        .notNull(),

    currency_value: char('currency_value', { length: 10 })
        .notNull(),

    currency_symbol: decimal('currency_symbol', {
        precision: 14,
        scale: 0,
    }).notNull(),

    total_price: float('total_price', {
        precision: 10,
        scale: 2,
    }),

    order_status: mysqlEnum('order_status', ['Pending', 'Closed', 'Canceled', 'Completed', 'Ready For Dispatch', 'Rejected', 'Deleted',])
        .notNull()
        .default('Pending'),

    status: mysqlEnum('status', ['0', '1', '2'])
        .notNull()
        .default('1'),

    payment_status: mysqlEnum('payment_status', [
        'Paid',
        'Unpaid',
    ])
        .notNull()
        .default('Unpaid'),

    payment_method: varchar('payment_method', { length: 100 }),

    project_count: int('project_count').default(0),

    property_count: int('property_count').default(0),

    property_count_rent: int('property_count_rent').default(0),

    property_count_land: int('property_count_land')
        .notNull()
        .default(0),

    total_property_post: int('total_property_post').default(0),

    total_rent_property_post: int('total_rent_property_post').default(0),

    total_project_post: int('total_project_post').default(0),

    total_land_post: int('total_land_post').default(0),

    receive_date: datetime('receive_date', {
        mode: 'string',
    }),

    membership_status: mysqlEnum('membership_status', ['0', '1'])
        .notNull()
        .default('0'),

    type: varchar('type', { length: 55 })
        .notNull()
        .default('Owner'),

    is_latest: int('is_latest'),
})

module.exports = { wlOrders }