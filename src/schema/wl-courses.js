const { mysqlTable, mysqlEnum, primaryKey, int, tinyint, float, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlCourses = mysqlTable("wl_courses", {
	courseId: int("course_id").autoincrement().notNull(),
	centerId: int("center_id").default(0).notNull(),
	categoryId: int("category_id").default(0).notNull(),
	courseName: varchar("course_name", { length: 200 }),
	friendlyUrl: varchar("friendly_url", { length: 110 }),
	courseImage: varchar("course_image", { length: 80 }),
	courseBrochure: varchar("course_brochure", { length: 80 }),
	durationId: int("duration_id").default(0).notNull(),
	courseFee: float("course_fee", { precision: 15, scale: 2 }).default(0).notNull(),
	courseDescription: text("course_description"),
	courseCurriculum: text("course_curriculum"),
	isFeatured: mysqlEnum("is_featured", ['1','0']).default('0').notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	centerStatus: tinyint("center_status").default(1).notNull(),
	courseAddedDate: datetime("course_added_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	courseUpdatedDate: datetime("course_updated_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	courseViewed: int("course_viewed", { unsigned: true }).default(0).notNull(),
	courseAlt: varchar("course_alt", { length: 100 }),
},
(table) => [
	primaryKey({ columns: [table.courseId], name: "wl_courses_course_id"}),
]);

module.exports = { wlCourses };
