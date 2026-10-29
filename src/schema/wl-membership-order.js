const {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  longblob,
  decimal,
  mysqlEnum,
  datetime,
} = require('drizzle-orm/mysql-core')

const wlMembershipOrders = mysqlTable('wl_membership_orders', {
  order_id: bigint('order_id', {
    mode: 'number',
  })
    .primaryKey()
    .autoincrement()
    .notNull(),

  order_date: datetime('order_date', {
    mode: 'string',
  }).notNull(),

  mem_id: int('mem_id').notNull(),

  mship_id: int('mship_id').notNull(),

  mship_name: varchar('mship_name', { length: 50 }).notNull(),

  duration: int('duration').notNull(),

  buy_lead_count: int('buy_lead_count').default(0).notNull(),

  mship_price: decimal('mship_price', {
    precision: 11,
    scale: 2,
  }).notNull(),

  payment_method: varchar('payment_method', { length: 40 }),

  pay_status: mysqlEnum('pay_status', ['0', '1'])
    .default('0')
    .notNull(),

  status: mysqlEnum('status', ['0', '1', '2'])
    .default('0')
    .notNull(),

  mship_image: longblob('mship_image'),

  is_cost: int('is_cost').default(0).notNull(),

  project_count: int('project_count').default(0),

  type: int('type').default(0).notNull(),

  property_count: int('property_count').default(0).notNull(),

  customer_support: int('customer_support').default(0).notNull(),

  expiry_date: varchar('expiry_date', { length: 50 }),

  order_status: int('order_status').default(0).notNull(),

  invoice_doc: text('invoice_doc'),

  cancel_reason: text('cancel_reason'),

  cancel_date: varchar('cancel_date', { length: 50 }),

  start_date: varchar('start_date', { length: 50 }),

  img2: text('img2'),

  order_type: int('order_type').default(1).notNull(),

  total_property_post: int('total_property_post').default(0).notNull(),

  total_project_post: int('total_project_post').default(0).notNull(),

  total_leads_buy: int('total_leads_buy').default(0).notNull(),

  is_latest: int('is_latest').notNull(),

  send_notification: mysqlEnum('send_notification', ['Y', 'N'])
    .default('N')
    .notNull(),
})

module.exports = { wlMembershipOrders }