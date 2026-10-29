const { mysqlTable, mysqlEnum, primaryKey, int, varchar, text, datetime } = require("drizzle-orm/mysql-core");

const wlTestimonials = mysqlTable("wl_testimonials", {
	testimonialId: int("testimonial_id").autoincrement().notNull(),
	testimonialTitle: varchar("testimonial_title", { length: 150 }),
	posterName: varchar("poster_name", { length: 30 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	email: varchar({ length: 80 }),
	testimonialDescription: text("testimonial_description"),
	photo: varchar({ length: 255 }),
	postedDate: datetime("posted_date", { mode: 'string'}),
	status: mysqlEnum(['1','0']).default('0').notNull(),
},
(table) => [
	primaryKey({ columns: [table.testimonialId], name: "wl_testimonials_testimonial_id"}),
]);

module.exports = { wlTestimonials };
