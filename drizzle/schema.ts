import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, varchar, tinytext, datetime, primaryKey, mysqlEnum, text, bigint, date, char, index, longtext, decimal, float, tinyint, timestamp } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const subadminActivityRecord = mysqlTable("subadmin_activity_record", {
	activityId: int("activity_id").notNull(),
	subadminId: varchar("subadmin_id", { length: 50 }),
	subadminName: varchar("subadmin_name", { length: 255 }),
	section: varchar({ length: 255 }),
	action: tinytext(),
	matterId: varchar("matter_id", { length: 255 }),
	matterName: varchar("matter_name", { length: 255 }),
	addedDate: datetime("added_date", { mode: 'string'}),
});

export const tblAdmin = mysqlTable("tbl_admin", {
	adminId: int("admin_id").autoincrement().notNull(),
	adminType: mysqlEnum("admin_type", ['1','2','3']).default('2').notNull(),
	adminKey: varchar("admin_key", { length: 15 }).notNull(),
	adminName: varchar("admin_name", { length: 450 }),
	adminUsername: varchar("admin_username", { length: 50 }).notNull(),
	adminPassword: varchar("admin_password", { length: 80 }),
	adminEmail: varchar("admin_email", { length: 255 }).notNull(),
	litigationDays: int("litigation_days"),
	adminLastLogin: datetime("admin_last_login", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	address: text(),
	corporateAddress: varchar("corporate_address", { length: 255 }),
	city: varchar({ length: 100 }),
	state: varchar({ length: 100 }),
	country: varchar({ length: 100 }),
	zipcode: varchar({ length: 50 }),
	phone: varchar({ length: 50 }),
	mobile: varchar({ length: 50 }),
	fax: varchar({ length: 50 }),
	contactPerson: varchar("contact_person", { length: 50 }),
	contactPhone: varchar("contact_phone", { length: 50 }),
	contactEmail: varchar("contact_email", { length: 50 }),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	totalHits: bigint("total_hits", { mode: "number" }).default(0).notNull(),
	facebookLink: varchar("facebook_link", { length: 250 }),
	twitterLink: varchar("twitter_link", { length: 250 }),
	linkedinLink: varchar("linkedin_link", { length: 250 }),
	instagramLink: varchar("instagram_link", { length: 250 }),
	youtubeLink: varchar("youtube_link", { length: 250 }),
	googleAnalyticsId: varchar("google_analytics_id", { length: 50 }),
	googleWebCode: text("google_web_code"),
	website: varchar({ length: 255 }),
	whatsappNumber: varchar("whatsapp_number", { length: 20 }),
	whatsappMessage: varchar("whatsapp_message", { length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	postDate: date("post_date", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.adminId], name: "tbl_admin_admin_id"}),
]);

export const tblAdminAllowedSections = mysqlTable("tbl_admin_allowed_sections", {
	id: int().autoincrement().notNull(),
	subadminId: int("subadmin_id").notNull(),
	secParentId: int("sec_parent_id").notNull(),
	secId: int("sec_id").notNull(),
	permission: varchar({ length: 25 }).default('1'),
	allowCategoryIds: varchar("allow_category_ids", { length: 255 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "tbl_admin_allowed_sections_id"}),
]);

export const tblAdminSections = mysqlTable("tbl_admin_sections", {
	id: int().autoincrement().notNull(),
	parentId: int("parent_id").default(0).notNull(),
	sectionTitle: varchar("section_title", { length: 100 }),
	sectionController: varchar("section_controller", { length: 100 }),
	dispOrder: int("disp_order").default(0).notNull(),
	actualPrivilege: varchar("actual_privilege", { length: 80 }),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "tbl_admin_sections_id"}),
]);

export const wlAutoRespondMails = mysqlTable("wl_auto_respond_mails", {
	id: int().autoincrement().notNull(),
	emailSection: varchar("email_section", { length: 80 }).notNull(),
	emailSubject: varchar("email_subject", { length: 200 }).notNull(),
	emailContent: text("email_content").notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	updatedOn: datetime("updated_on", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_auto_respond_mails_id"}),
]);

export const wlBanners = mysqlTable("wl_banners", {
	bannerId: int("banner_id").autoincrement().notNull(),
	bannerPosition: varchar("banner_position", { length: 100 }),
	bannerImage: varchar("banner_image", { length: 200 }),
	bannerUrl: varchar("banner_url", { length: 170 }),
	bannerPage: varchar("banner_page", { length: 30 }),
	status: mysqlEnum(['1','0']).default('1'),
	clicks: int().default(0).notNull(),
	bannerAddedDate: datetime("banner_added_date", { mode: 'string'}),
	bannerStartDate: datetime("banner_start_date", { mode: 'string'}),
	bannerEndDate: datetime("banner_end_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.bannerId], name: "wl_banners_banner_id"}),
]);

export const wlCategories = mysqlTable("wl_categories", {
	categoryId: int("category_id").autoincrement().notNull(),
	categoryName: varchar("category_name", { length: 100 }),
	categoryLinks: varchar("category_links", { length: 255 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	categoryImage: varchar("category_image", { length: 255 }),
	categoryDescription: text("category_description"),
	parentId: int("parent_id").default(0).notNull(),
	isHome: mysqlEnum("is_home", ['1','0']).default('0').notNull(),
	isFooter: mysqlEnum("is_footer", ['0','1']).default('0').notNull(),
	isFixed: mysqlEnum("is_fixed", ['1','0']).default('0').notNull(),
	sortOrder: int("sort_order"),
	dateAdded: datetime("date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	dateModified: datetime("date_modified", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	metaTitle: varchar("meta_title", { length: 100 }),
	metaKeywords: varchar("meta_keywords", { length: 100 }),
	metaDescription: varchar("meta_description", { length: 225 }),
	categoryAlt: varchar("category_alt", { length: 200 }),
},
(table) => [
	primaryKey({ columns: [table.categoryId], name: "wl_categories_category_id"}),
]);

export const wlCenters = mysqlTable("wl_centers", {
	centerId: int("center_id").autoincrement().notNull(),
	centerName: varchar("center_name", { length: 90 }),
	centerCode: varchar("center_code", { length: 20 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	email: varchar({ length: 80 }),
	password: varchar({ length: 80 }),
	yoe: varchar({ length: 4 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	address: varchar({ length: 255 }),
	centerImage: varchar("center_image", { length: 50 }),
	cityId: int("city_id").default(0),
	locationId: int("location_id").default(0).notNull(),
	centerDescription: text("center_description"),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['1','0']).default('1').notNull(),
	centerDateAdded: datetime("center_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	centerDateUpdated: datetime("center_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	currentLogin: datetime("current_login", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	lastLoginDate: datetime("last_login_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.centerId], name: "wl_centers_center_id"}),
]);

export const wlCities = mysqlTable("wl_cities", {
	cityId: int("city_id").autoincrement().notNull(),
	countryId: int("country_id").default(0).notNull(),
	title: varchar({ length: 80 }),
	createdAt: datetime("created_at", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	createdBy: int("created_by").default(1).notNull(),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.cityId], name: "wl_cities_city_id"}),
]);

export const wlCmsPages = mysqlTable("wl_cms_pages", {
	pageId: int("page_id").autoincrement().notNull(),
	parentId: int("parent_id").default(0).notNull(),
	pageName: varchar("page_name", { length: 50 }).default('').notNull(),
	friendlyUrl: varchar("friendly_url", { length: 50 }).notNull(),
	pageDescription: longtext("page_description").notNull(),
	pageShortDescription: text("page_short_description"),
	image: varchar({ length: 50 }).notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	pageUpdatedDate: datetime("page_updated_date", { mode: 'string'}).notNull(),
},
(table) => [
	index("friendly_url").on(table.friendlyUrl),
	primaryKey({ columns: [table.pageId], name: "wl_cms_pages_page_id"}),
]);

export const wlCountries = mysqlTable("wl_countries", {
	id: int().autoincrement().notNull(),
	countryName: varchar("country_name", { length: 64 }).notNull(),
	countryTempName: varchar("country_temp_name", { length: 250 }).notNull(),
	countryIsoCode2: char("country_iso_code_2", { length: 2 }),
	countryIsoCode3: char("country_iso_code_3", { length: 3 }),
	countryFlag: varchar("country_flag", { length: 80 }),
	createdBy: int("created_by").default(1).notNull(),
	status: char({ length: 1 }).default('1').notNull(),
	timeZone: varchar("TimeZone", { length: 32 }).notNull(),
	utcOffset: varchar("UTC_offset", { length: 8 }).notNull(),
},
(table) => [
	index("IDX_COUNTRIES_NAME").on(table.countryName),
	primaryKey({ columns: [table.id], name: "wl_countries_id"}),
]);

export const wlCouponCustomers = mysqlTable("wl_coupon_customers", {
	id: int().autoincrement().notNull(),
	customerId: int("customer_id").notNull(),
	name: varchar({ length: 150 }),
	email: varchar({ length: 80 }),
	description: text(),
	couponId: int("coupon_id").notNull(),
	usedCount: int("used_count").default(0).notNull(),
	status: mysqlEnum(['0','1','2']).default('0').notNull(),
	receiveOn: datetime("receive_on", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_coupon_customers_id"}),
]);

export const wlCoupons = mysqlTable("wl_coupons", {
	couponId: int("coupon_id").autoincrement().notNull(),
	couponTitle: varchar("coupon_title", { length: 200 }),
	couponCode: varchar("coupon_code", { length: 10 }),
	couponType: mysqlEnum("coupon_type", ['p','f','a']).default('p').notNull(),
	couponUsage: mysqlEnum("coupon_usage", ['multiple','single']).default('single').notNull(),
	usageCount: int("usage_count").default(1).notNull(),
	couponFor: mysqlEnum("coupon_for", ['0','1']).default('0').notNull(),
	couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	maximumCouponDiscount: float("maximum_coupon_discount", { precision: 10, scale: 2 }).default(0).notNull(),
	minimumOrderAmount: decimal("minimum_order_amount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	startDate: date("start_date", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	endDate: date("end_date", { mode: 'string' }),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	dateAdded: datetime("date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.couponId], name: "wl_coupons_coupon_id"}),
]);

export const wlCourseCategories = mysqlTable("wl_course_categories", {
	categoryId: int("category_id").autoincrement().notNull(),
	categoryName: varchar("category_name", { length: 100 }),
	categoryLinks: varchar("category_links", { length: 255 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }),
	categoryImage: varchar("category_image", { length: 255 }),
	categoryDescription: text("category_description"),
	parentId: int("parent_id").default(0).notNull(),
	isHome: mysqlEnum("is_home", ['1','0']).default('0').notNull(),
	isFooter: mysqlEnum("is_footer", ['0','1']).default('0').notNull(),
	isFixed: mysqlEnum("is_fixed", ['1','0']).default('0').notNull(),
	sortOrder: int("sort_order"),
	dateAdded: datetime("date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	dateModified: datetime("date_modified", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	metaTitle: varchar("meta_title", { length: 100 }),
	metaKeywords: varchar("meta_keywords", { length: 100 }),
	metaDescription: varchar("meta_description", { length: 225 }),
	categoryAlt: varchar("category_alt", { length: 200 }),
},
(table) => [
	primaryKey({ columns: [table.categoryId], name: "wl_course_categories_category_id"}),
]);

export const wlCourses = mysqlTable("wl_courses", {
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

export const wlCurrencies = mysqlTable("wl_currencies", {
	currencyId: int("currency_id").autoincrement().notNull(),
	title: varchar({ length: 32 }).default('').notNull(),
	code: varchar({ length: 3 }).default('').notNull(),
	symbolLeft: varchar("symbol_left", { length: 12 }).notNull(),
	symbolRight: varchar("symbol_right", { length: 12 }).notNull(),
	currImage: varchar("curr_image", { length: 250 }).notNull(),
	decimalPlace: char("decimal_place", { length: 1 }).notNull(),
	value: float({ precision: 15, scale: 8 }).notNull(),
	isDefault: mysqlEnum("is_default", ['Y','N']).default('N').notNull(),
	status: int().notNull(),
	dateModified: datetime("date_modified", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.currencyId], name: "wl_currencies_currency_id"}),
]);

export const wlCustomers = mysqlTable("wl_customers", {
	customerId: int("customer_id").autoincrement().notNull(),
	userName: varchar("user_name", { length: 80 }).notNull(),
	password: varchar({ length: 100 }).notNull(),
	title: varchar({ length: 10 }),
	firstName: varchar("first_name", { length: 32 }),
	lastName: varchar("last_name", { length: 32 }),
	gender: mysqlEnum(['Male','Female']).default('Male'),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	birthDate: date("birth_date", { mode: 'string' }),
	customerPhoto: varchar("customer_photo", { length: 32 }),
	phoneNumber: varchar("phone_number", { length: 32 }),
	mobileNumber: varchar("mobile_number", { length: 32 }),
	faxNumber: varchar("fax_number", { length: 32 }),
	actkey: varchar({ length: 32 }).notNull(),
	status: mysqlEnum(['0','1','2','3']).default('0').notNull(),
	isVerified: mysqlEnum("is_verified", ['0','1']).default('0').notNull(),
	isVerifiedMobile: mysqlEnum("is_verified_mobile", ['0','1']).default('0').notNull(),
	loginType: mysqlEnum("login_type", ['normal','facebook','twitter','salon_partner','salon_user']).default('normal').notNull(),
	accountCreatedDate: datetime("account_created_date", { mode: 'string'}),
	currentLogin: datetime("current_login", { mode: 'string'}),
	lastLoginDate: datetime("last_login_date", { mode: 'string'}),
	ipAddress: varchar("ip_address", { length: 25 }).notNull(),
	isBlocked: mysqlEnum("is_blocked", ['0','1']).default('0').notNull(),
	blockTime: datetime("block_time", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	numberOfLoginTry: int("number_of_login_try").default(0).notNull(),
	replied: mysqlEnum(['Y','N']).default('N').notNull(),
	serviceType: mysqlEnum("service_type", ['1','2']),
	customerType: mysqlEnum("customer_type", ['1','2']),
},
(table) => [
	primaryKey({ columns: [table.customerId], name: "wl_customers_customer_id"}),
]);

export const wlCustomersAddressBook = mysqlTable("wl_customers_address_book", {
	addressId: int("address_id").autoincrement().notNull(),
	customerId: int("customer_id").notNull(),
	firstName: varchar("first_name", { length: 40 }),
	lastName: varchar("last_name", { length: 40 }),
	name: varchar({ length: 32 }),
	address: varchar({ length: 200 }),
	mobile: varchar({ length: 25 }),
	zipcode: varchar({ length: 25 }),
	phone: varchar({ length: 25 }),
	fax: varchar({ length: 50 }),
	landmark: varchar({ length: 150 }),
	city: varchar({ length: 50 }),
	state: varchar({ length: 50 }),
	country: varchar({ length: 80 }),
	recivDate: datetime("reciv_date", { mode: 'string'}).notNull(),
	addressType: mysqlEnum("address_type", ['Bill','Ship']).notNull(),
	defaultStatus: mysqlEnum("default_status", ['Y','N']).default('N').notNull(),
},
(table) => [
	primaryKey({ columns: [table.addressId], name: "wl_customers_address_book_address_id"}),
]);

export const wlDurations = mysqlTable("wl_durations", {
	durationId: int("duration_id").autoincrement().notNull(),
	durationName: varchar("duration_name", { length: 80 }).default('').notNull(),
	durationDateAdded: datetime("duration_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	durationDateUpdated: datetime("duration_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
},
(table) => [
	index("idx_mfg_name_zen").on(table.durationName),
	primaryKey({ columns: [table.durationId], name: "wl_durations_duration_id"}),
]);

export const wlEnquiries = mysqlTable("wl_enquiries", {
	id: int().autoincrement().notNull(),
	type: mysqlEnum(['1','2','3']).default('1').notNull(),
	entityName: varchar("entity_name", { length: 255 }),
	entityId: int("entity_id").default(0),
	centerId: int("center_id").default(0).notNull(),
	email: varchar({ length: 80 }).notNull(),
	firstName: varchar("first_name", { length: 30 }).notNull(),
	lastName: varchar("last_name", { length: 30 }).notNull(),
	companyName: varchar("company_name", { length: 60 }),
	country: varchar({ length: 200 }),
	state: varchar({ length: 50 }),
	city: varchar({ length: 50 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	extNumber: varchar("ext_number", { length: 50 }),
	mobileNumber: varchar("mobile_number", { length: 20 }),
	faxNumber: varchar("fax_number", { length: 30 }),
	address: varchar({ length: 220 }),
	zipcode: varchar({ length: 10 }),
	requirement: text(),
	message: text().notNull(),
	status: mysqlEnum(['1','2']).notNull(),
	replyStatus: mysqlEnum("reply_status", ['Y','N']).default('N').notNull(),
	receiveDate: datetime("receive_date", { mode: 'string'}).notNull(),
	jobTitle: varchar("job_title", { length: 50 }),
	inquiryType: varchar("inquiry_type", { length: 80 }),
	resume: varchar({ length: 100 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_enquiries_id"}),
]);

export const wlFaq = mysqlTable("wl_faq", {
	faqId: int("faq_id").autoincrement().notNull(),
	faqParentId: int("faq_parent_id").default(0).notNull(),
	faqQuestion: varchar("faq_question", { length: 225 }).notNull(),
	faqAnswer: text("faq_answer").notNull(),
	sortOrder: int("sort_order"),
	status: mysqlEnum(['1','2','3']).default('1').notNull(),
	faqDateAdded: datetime("faq_date_added", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.faqId], name: "wl_faq_faq_id"}),
]);

export const wlHeaderImages = mysqlTable("wl_header_images", {
	id: int().autoincrement().notNull(),
	headerImage: varchar("header_image", { length: 200 }).notNull(),
	headerUrl: varchar("header_url", { length: 255 }),
	lineOne: varchar("line_one", { length: 100 }),
	lineTwo: varchar("line_two", { length: 150 }),
	status: mysqlEnum(['1','0','2']).notNull(),
	addedDate: datetime("added_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_header_images_id"}),
]);

export const wlInviteFriends = mysqlTable("wl_invite_friends", {
	inviteId: int("invite_id").notNull(),
	friendName: varchar("friend_name", { length: 100 }).notNull(),
	friendEmail: varchar("friend_email", { length: 100 }).notNull(),
	yourName: varchar("your_name", { length: 100 }).notNull(),
	yourEmail: varchar("your_email", { length: 100 }).notNull(),
	receiveDate: datetime("receive_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.inviteId], name: "wl_invite_friends_invite_id"}),
]);

export const wlLocalities = mysqlTable("wl_localities", {
	locationId: int("location_id").autoincrement().notNull(),
	cityId: int("city_id").default(0).notNull(),
	stateId: int("state_id").default(0).notNull(),
	countryId: int("country_id").default(0).notNull(),
	title: varchar({ length: 80 }),
	createdAt: datetime("created_at", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	status: char({ length: 1 }).default('1').notNull(),
},
(table) => [
	primaryKey({ columns: [table.locationId], name: "wl_localities_location_id"}),
]);

export const wlMetaTags = mysqlTable("wl_meta_tags", {
	metaId: int("meta_id").autoincrement().notNull(),
	isFixed: mysqlEnum("is_fixed", ['Y','N']).default('N').notNull(),
	entityType: varchar("entity_type", { length: 80 }),
	entityId: int("entity_id").default(0).notNull(),
	pageUrl: varchar("page_url", { length: 200 }).notNull(),
	metaTitle: varchar("meta_title", { length: 80 }).notNull(),
	metaDescription: varchar("meta_description", { length: 220 }).notNull(),
	metaKeyword: varchar("meta_keyword", { length: 460 }),
	status: mysqlEnum(['0','1']).default('1').notNull(),
},
(table) => [
	index("entity_id").on(table.entityId),
	index("entity_type").on(table.entityType),
	index("page_url").on(table.pageUrl),
	primaryKey({ columns: [table.metaId], name: "wl_meta_tags_meta_id"}),
]);

export const wlNewsletterGroupSubscriber = mysqlTable("wl_newsletter_group_subscriber", {
	groupSubscriberId: int("group_subscriber_id").notNull(),
	newsletterGroupsId: int("newsletter_groups_id").notNull(),
	subscriberId: int("subscriber_id").notNull(),
	dateAdded: datetime("date_added", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.groupSubscriberId], name: "wl_newsletter_group_subscriber_group_subscriber_id"}),
]);

export const wlNewsletterGroups = mysqlTable("wl_newsletter_groups", {
	newsletterGroupsId: int("newsletter_groups_id").notNull(),
	groupName: varchar("group_name", { length: 40 }).notNull(),
	status: mysqlEnum(['1','0']).default('1').notNull(),
	groupsCreatedDate: datetime("groups_created_date", { mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.newsletterGroupsId], name: "wl_newsletter_groups_newsletter_groups_id"}),
]);

export const wlNewsletterLog = mysqlTable("wl_newsletter_log", {
	id: int().notNull(),
	newsletterData: longtext("newsletter_data").notNull(),
	postedDate: timestamp("posted_date", { mode: 'string' }).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "wl_newsletter_log_id"}),
]);

export const wlNewsletters = mysqlTable("wl_newsletters", {
	subscriberId: int("subscriber_id").autoincrement().notNull(),
	subscriberName: varchar("subscriber_name", { length: 32 }),
	subscriberEmail: varchar("subscriber_email", { length: 80 }),
	status: mysqlEnum(['0','1','2']).default('1'),
	mailStatus: mysqlEnum("mail_status", ['1','0']).default('0'),
	subscribeDate: datetime("subscribe_date", { mode: 'string'}),
	mailSentDate: datetime("mail_sent_date", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.subscriberId], name: "wl_newsletters_subscriber_id"}),
]);

export const wlOrderPackages = mysqlTable("wl_order_packages", {
	orderItemId: int("order_item_id").autoincrement().notNull(),
	orderId: int("order_id").default(0).notNull(),
	packageId: int("package_id"),
	packageDuration: varchar("package_duration", { length: 70 }),
	packageName: varchar("package_name", { length: 100 }),
	// Warning: Can't parse longblob from database
	// longblobType: longblob("package_image"),
	packagePrice: float("package_price", { precision: 10, scale: 2 }),
	quantity: int().default(1).notNull(),
	couponCode: varchar("coupon_code", { length: 40 }),
	couponDiscount: float("coupon_discount", { precision: 10, scale: 2 }).default(0).notNull(),
},
(table) => [
	index("order_id").on(table.orderItemId),
	index("order_no").on(table.orderId),
	primaryKey({ columns: [table.orderItemId], name: "wl_order_packages_order_item_id"}),
]);

export const wlOrders = mysqlTable("wl_orders", {
	orderId: int("order_id").autoincrement().notNull(),
	customerId: int("customer_id").default(0).notNull(),
	customerType: varchar("customer_type", { length: 100 }).default('Member'),
	invoiceNumber: varchar("invoice_number", { length: 30 }),
	firstName: varchar("first_name", { length: 50 }),
	lastName: varchar("last_name", { length: 50 }),
	mobileNumber: varchar("mobile_number", { length: 50 }),
	phone: varchar({ length: 50 }),
	email: varchar({ length: 50 }),
	discountCouponId: int("discount_coupon_id").default(0).notNull(),
	discountCouponCode: varchar("discount_coupon_code", { length: 40 }),
	couponDiscountAmount: float("coupon_discount_amount", { precision: 10, scale: 2 }),
	totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default('0.00').notNull(),
	vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).default('0.00'),
	vatAppliedCent: float("vat_applied_cent", { precision: 10, scale: 2 }).default(0).notNull(),
	currencyCode: char("currency_code", { length: 3 }),
	currencySymbol: char("currency_symbol", { length: 10 }),
	currencyValue: decimal("currency_value", { precision: 14, scale: 6 }).default('0.000000').notNull(),
	orderStatus: varchar("order_status", { length: 10 }).default('Placed').notNull(),
	orderReceivedDate: datetime("order_received_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	paymentMethod: varchar("payment_method", { length: 200 }),
	paymentStatus: mysqlEnum("payment_status", ['Paid','Unpaid']).default('Unpaid').notNull(),
},
(table) => [
	primaryKey({ columns: [table.orderId], name: "wl_orders_order_id"}),
]);

export const wlPackages = mysqlTable("wl_packages", {
	packageId: int("package_id").autoincrement().notNull(),
	categoryId: int("category_id").default(0).notNull(),
	categoryLinks: varchar("category_links", { length: 80 }),
	packageName: varchar("package_name", { length: 100 }),
	friendlyUrl: varchar("friendly_url", { length: 110 }),
	packageCode: varchar("package_code", { length: 64 }),
	durationId: int("duration_id").default(0).notNull(),
	packagePrice: float("package_price", { precision: 15, scale: 2 }).default(0).notNull(),
	packageDiscountedPrice: float("package_discounted_price", { precision: 15, scale: 2 }).default(0).notNull(),
	packageDescription: text("package_description"),
	isFeatured: mysqlEnum("is_featured", ['1','0']).default('0').notNull(),
	status: mysqlEnum(['0','1','2']).default('1').notNull(),
	packageAddedDate: datetime("package_added_date", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	packageUpdatedDate: datetime("package_updated_date", { mode: 'string'}).default('0000-00-00 00:00:00'),
	packageViewed: int("package_viewed", { unsigned: true }).default(0).notNull(),
	packageAlt: varchar("package_alt", { length: 100 }),
},
(table) => [
	primaryKey({ columns: [table.packageId], name: "wl_packages_package_id"}),
]);

export const wlPackagesMedia = mysqlTable("wl_packages_media", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	packageId: int("package_id", { unsigned: true }).default(0).notNull(),
	mediaType: mysqlEnum("media_type", ['photo','video','pdf']).default('photo').notNull(),
	media: varchar({ length: 255 }),
	isDefault: mysqlEnum("is_default", ['Y','N']).default('N').notNull(),
	mediaDateAdded: datetime("media_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	index("idx_products_images_products_id").on(table.packageId),
	primaryKey({ columns: [table.id], name: "wl_packages_media_id"}),
]);

export const wlPortfolios = mysqlTable("wl_portfolios", {
	portfolioId: int("portfolio_id").autoincrement().notNull(),
	portfolioTitle: varchar("portfolio_title", { length: 90 }),
	friendlyUrl: varchar("friendly_url", { length: 100 }).notNull(),
	portfolioImage: varchar("portfolio_image", { length: 50 }),
	portfolioDescription: longtext("portfolio_description"),
	sortOrder: int("sort_order"),
	isHome: tinyint("is_home").default(0).notNull(),
	status: tinyint().default(1).notNull(),
	portfolioDateAdded: datetime("portfolio_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	portfolioDateUpdated: datetime("portfolio_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.portfolioId], name: "wl_portfolios_portfolio_id"}),
]);

export const wlSalons = mysqlTable("wl_salons", {
	salonId: int("salon_id").autoincrement().notNull(),
	salonName: varchar("salon_name", { length: 90 }),
	salonImage: varchar("salon_image", { length: 50 }),
	cityId: int("city_id").default(0),
	locationId: int("location_id").default(0).notNull(),
	sortOrder: int("sort_order"),
	status: tinyint().default(1).notNull(),
	salonDateAdded: datetime("salon_date_added", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
	salonDateUpdated: datetime("salon_date_updated", { mode: 'string'}).default('0000-00-00 00:00:00').notNull(),
},
(table) => [
	primaryKey({ columns: [table.salonId], name: "wl_salons_salon_id"}),
]);

export const wlSessions = mysqlTable("wl_sessions", {
	id: varchar({ length: 128 }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	timestamp: int({ unsigned: true }).default(0).notNull(),
	// Warning: Can't parse blob from database
	// blobType: blob("data").notNull(),
},
(table) => [
	index("ci_sessions_timestamp").on(table.timestamp),
	primaryKey({ columns: [table.id, table.ipAddress], name: "wl_sessions_id_ip_address"}),
]);

export const wlStudentResults = mysqlTable("wl_student_results", {
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

export const wlStudents = mysqlTable("wl_students", {
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

export const wlTestimonials = mysqlTable("wl_testimonials", {
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
