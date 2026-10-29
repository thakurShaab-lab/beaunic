const { mysqlTable, mysqlEnum, primaryKey, int, float, varchar, text, date, datetime } = require("drizzle-orm/mysql-core");

const wlStudents = mysqlTable("wl_students", {
	studentId: int("student_id").autoincrement().notNull(),
	centerId: int("center_id").default(0).notNull(),
	categoryId: int("category_id").default(0).notNull(),
	courseId: int("course_id").default(0).notNull(),
	registrationNumber: varchar("registration_number", { length: 40 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	doj: date({ mode: 'string' }),
	studentName: varchar("student_name", { length: 200 }),
	motherName: varchar("mother_name", { length: 50 }),
	fatherName: varchar("father_name", { length: 50 }),
	emailId: varchar("email_id", { length: 80 }),
	dob: varchar({ length: 20 }),
	mobileNumber: varchar("mobile_number", { length: 20 }),
	address: varchar({ length: 255 }),
	cityId: int("city_id").default(0).notNull(),
	locationId: int("location_id").default(0).notNull(),
	studentImage: varchar("student_image", { length: 80 }),
	durationId: int("duration_id").default(0).notNull(),
	paidAmount: float("paid_amount", { precision: 15, scale: 2 }).default(0).notNull(),
	paymentType: varchar("payment_type", { length: 20 }),
	otherDetails: text("other_details"),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	studentAddedDate: datetime("student_added_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	studentUpdatedDate: datetime("student_updated_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	idCard: varchar("id_card", { length: 80 }),
	idCardUploadedDate: datetime("id_card_uploaded_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.studentId], name: "wl_students_student_id"}),
]);

module.exports = { wlStudents };
