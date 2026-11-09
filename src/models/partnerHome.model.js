const { eq, and, asc, desc, sql, count, avg } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlBookings } = require("../schema/wl-bookings")
const { wlEnquiries } = require("../schema/wl-enquiries")
const { wlReviews } = require("../schema/wl-reviews")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")
const { BOOKING_TABS, bookingTab } = require("./booking.model")

const sumIf = (condition) => sql`COALESCE(SUM(${condition}), 0)`.mapWith(Number)
const amountIf = (condition) => sql`COALESCE(SUM(CASE WHEN ${condition} THEN ${wlBookings.totalAmount} ELSE 0 END), 0)`.mapWith(Number)

const isCancelled = BOOKING_TABS.cancelled()
const isPaid = sql`${wlBookings.paymentStatus} = 'Paid'`
// payment_mode says Online / Cash; older paid bookings without it count as cash when their method is "Cash"
const isCash = sql`(${wlBookings.paymentMode} = 'cash' OR (${wlBookings.paymentMode} IS NULL AND LOWER(TRIM(COALESCE(${wlBookings.paymentMethod}, ''))) = 'cash'))`
// When the money came in: payment_received_date, else when the booking was made (both UTC)
const paidOn = sql`COALESCE(${wlBookings.paymentReceivedDate}, ${wlBookings.orderReceivedDate})`

// The salon's booking numbers for the stat cards, requests and Payment Overview, in one query (all from wl_bookings).
//   today / nowTime: salon clock; since: UTC datetime 30 days ago
const findBookingStats = async (salonId, { today, nowTime, since }) => {
    const recentPaid = sql`(${isPaid} AND ${paidOn} >= ${since})`
    const [row] = await db
        .select({
            today: sumIf(sql`(NOT ${isCancelled} AND ${wlBookings.slotDate} = ${today})`),
            upcoming: sumIf(BOOKING_TABS.upcoming(today, nowTime)),
            completed: sumIf(BOOKING_TABS.completed(today, nowTime)),
            // Every booking made at the salon that wasn't cancelled (the "Orders" card)
            totalBookings: sumIf(sql`NOT ${isCancelled}`),
            // Requests waiting for the salon's approval
            pendingCancellations: sumIf(sql`${wlBookings.cancelStatus} = 'pending'`),
            pendingReschedules: sumIf(sql`${wlBookings.rescheduleStatus} = 'pending'`),
            // Payment Overview: online vs cash in the last 30 days
            paymentsTotal: amountIf(recentPaid),
            paymentsCash: amountIf(sql`(${recentPaid} AND ${isCash})`),
            paidCount: sumIf(recentPaid),
            cashCount: sumIf(sql`(${recentPaid} AND ${isCash})`),
        })
        .from(wlBookings)
        .where(eq(wlBookings.salonId, salonId))

    return row
}

const bookingCard = (today, nowTime) => ({
    bookingId: wlBookings.bookingId,
    firstName: wlBookings.firstName,
    lastName: wlBookings.lastName,
    serviceName: wlBookings.serviceName,
    slotDate: wlBookings.slotDate,
    startTime: wlBookings.startTime,
    endTime: wlBookings.endTime,
    tab: bookingTab(today, nowTime).mapWith(String),
})

// Today's bookings at the salon (not cancelled), earliest first
const findTodaySchedule = async (salonId, { today, nowTime, limit }) =>
    db
        .select(bookingCard(today, nowTime))
        .from(wlBookings)
        .where(and(eq(wlBookings.salonId, salonId), eq(wlBookings.slotDate, today), sql`NOT ${isCancelled}`))
        .orderBy(asc(wlBookings.startTime), asc(wlBookings.bookingId))
        .limit(limit)

// The latest bookings made at the salon, any status
const findRecentBookings = async (salonId, { today, nowTime, limit }) =>
    db
        .select(bookingCard(today, nowTime))
        .from(wlBookings)
        .where(eq(wlBookings.salonId, salonId))
        .orderBy(desc(wlBookings.orderReceivedDate), desc(wlBookings.bookingId))
        .limit(limit)

// Salon enquiries sent from the app (/enquiry/send) to this salon
const salonEnquiries = (salonId) => and(eq(wlEnquiries.entityId, salonId), eq(wlEnquiries.inquiryType, "Salon Enquiry"))

const countPendingEnquiries = async (salonId) => {
    const [row] = await db.select({ total: count() }).from(wlEnquiries).where(and(salonEnquiries(salonId), eq(wlEnquiries.replyStatus, "N")))

    return Number(row.total)
}

const findLatestEnquiries = async (salonId, limit) =>
    db
        .select({
            enquiryId: wlEnquiries.id,
            firstName: wlEnquiries.firstName,
            lastName: wlEnquiries.lastName,
            serviceName: wlEnquiries.requirement,
            message: wlEnquiries.message,
            replyStatus: wlEnquiries.replyStatus,
            receiveDate: wlEnquiries.receiveDate,
        })
        .from(wlEnquiries)
        .where(salonEnquiries(salonId))
        .orderBy(desc(wlEnquiries.receiveDate), desc(wlEnquiries.id))
        .limit(limit)

// Active reviews of the salon and its services
const salonReviews = (salonId) => and(eq(wlReviews.salonId, salonId), eq(wlReviews.status, "1"))

const findReviewSummary = async (salonId) => {
    const [row] = await db.select({ averageRating: avg(wlReviews.rating), total: count() }).from(wlReviews).where(salonReviews(salonId))

    return { averageRating: row.averageRating !== null ? Number(row.averageRating) : 0, total: Number(row.total) }
}

const reviewer = alias(wlCustomers, "reviewer")

const findLatestReviews = async (salonId, limit) =>
    db
        .select({
            reviewId: wlReviews.reviewId,
            reviewType: wlReviews.reviewType,
            firstName: reviewer.firstName,
            lastName: reviewer.lastName,
            serviceName: wlServices.serviceName,
            rating: wlReviews.rating,
            reviewText: wlReviews.reviewText,
            reviewAddedDate: wlReviews.reviewAddedDate,
        })
        .from(wlReviews)
        .leftJoin(reviewer, eq(reviewer.customerId, wlReviews.customerId))
        .leftJoin(wlServices, and(eq(wlReviews.reviewType, "service"), eq(wlServices.serviceId, wlReviews.reviewForId)))
        .where(salonReviews(salonId))
        .orderBy(desc(wlReviews.reviewAddedDate), desc(wlReviews.reviewId))
        .limit(limit)

module.exports = {
    findBookingStats,
    findTodaySchedule,
    findRecentBookings,
    countPendingEnquiries,
    findLatestEnquiries,
    findReviewSummary,
    findLatestReviews,
}
