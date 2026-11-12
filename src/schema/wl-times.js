const { mysqlTable, mysqlEnum, primaryKey, uniqueIndex, int, varchar, time, datetime } = require('drizzle-orm/mysql-core')

const wlTimes = mysqlTable('wl_times', {
	timeId: int('time_id').autoincrement().notNull(),
	timeValue: time('time_value').notNull(),                                               // 24-hour time, e.g. 14:30:00
	timeLabel: varchar('time_label', { length: 20 }).default('').notNull(),                // As shown, e.g. "02:30 PM"
	sortOrder: int('sort_order'),
	status: mysqlEnum(['1','0','2']).default('1').notNull(),                               // 1=Active, 0=Inactive, 2=Deleted
	timeAddedDate: datetime('time_added_date', { mode: 'string'}),
	timeUpdatedDate: datetime('time_updated_date', { mode: 'string'}),
},
(table) => [
	uniqueIndex('uq_times_time_value').on(table.timeValue),
	primaryKey({ columns: [table.timeId], name: 'wl_times_time_id'}),
])

module.exports = { wlTimes }
