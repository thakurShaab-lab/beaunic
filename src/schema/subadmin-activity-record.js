const { mysqlTable, int, varchar, tinytext, datetime } = require("drizzle-orm/mysql-core");

const subadminActivityRecord = mysqlTable("subadmin_activity_record", {
	activityId: int("activity_id").notNull(),
	subadminId: varchar("subadmin_id", { length: 50 }),
	subadminName: varchar("subadmin_name", { length: 255 }),
	section: varchar({ length: 255 }),
	action: tinytext(),
	matterId: varchar("matter_id", { length: 255 }),
	matterName: varchar("matter_name", { length: 255 }),
	addedDate: datetime("added_date", { mode: 'string'}),
});

module.exports = { subadminActivityRecord };
