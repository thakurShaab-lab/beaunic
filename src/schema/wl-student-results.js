const { mysqlTable, mysqlEnum, primaryKey, int, varchar, datetime } = require("drizzle-orm/mysql-core");

const wlStudentResults = mysqlTable("wl_student_results", {
	resultId: int("result_id").autoincrement().notNull(),
	studentId: int("student_id").default(0).notNull(),
	centerId: int("center_id").default(0).notNull(),
	courseId: int("course_id").default(0).notNull(),
	totalMarks: int("total_marks").default(0).notNull(),
	studentMarks: int("student_marks").default(0).notNull(),
	certificate: varchar({ length: 80 }),
	marksheet: varchar({ length: 80 }),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	resultAddedDate: datetime("result_added_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	resultUpdatedDate: datetime("result_updated_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	certificateUploadedDate: datetime("certificate_uploaded_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	marksheetUploadedDate: datetime("marksheet_uploaded_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.resultId], name: "wl_student_results_result_id"}),
]);

module.exports = { wlStudentResults };
