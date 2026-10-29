const {
  mysqlTable,
  int,
  varchar,
  text,
  mysqlEnum,
  datetime,
} = require('drizzle-orm/mysql-core')

const wlMembership = mysqlTable('wl_memberships', {
  membership_id: int('membership_id')
    .primaryKey()
    .autoincrement()
    .notNull(),

  title: varchar('title', { length: 100 }).notNull(),

  plan_name: varchar('plan_name', { length: 255 }),

  duration: int('duration').notNull(),

  price: int('price').notNull(),

  description: text('description'),

  buy_lead_count: int('buy_lead_count').default(100).notNull(),

  status: mysqlEnum('status', ['0', '1', '2'])
    .default('0')
    .notNull(),

  membership_image: text('membership_image'),

  is_cost: int('is_cost').default(0).notNull(),

  type: int('type').default(1).notNull(),

  added_date: datetime('added_date', {
    mode: 'string',
  }),

  updated_date: datetime('updated_date', {
    mode: 'string',
  }),

  customer_support: int('customer_support').default(0).notNull(),

  property_count: int('property_count').default(0).notNull(),

  project_count: int('project_count').default(0).notNull(),

  property_count_rent: int('property_count_rent').default(0),

  property_count_land: int('property_count_land').default(0),

  property_type: int('property_type').default(0).notNull(),
})

module.exports = { wlMembership }