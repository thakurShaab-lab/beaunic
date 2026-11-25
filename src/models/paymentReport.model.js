const { eq, and, desc, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlBookings } = require("../schema/wl-bookings")
const { isBooking } = require("./bookingScope")
const { BOOKING_TABS } = require("./booking.model")
// Same rules as the Payment Overview on the partner home: paid / cash, and when the money came in
const { isPaid, isCash, paidOn } = require("./partnerHome.model")

// The salon's payments: every paid booking (received), and unpaid bookings that weren't cancelled (still to collect).
//   since: UTC datetime the period starts (undefined = All)
const paymentsCondition = (salonId, since) =>
    and(
        eq(wlBookings.salonId, salonId),
        isBooking,
        sql`(${isPaid} OR NOT ${BOOKING_TABS.cancelled()})`,
        since ? sql`${paidOn} >= ${since}` : undefined
    )

const amountIf = (condition) => sql`COALESCE(SUM(CASE WHEN ${condition} THEN ${wlBookings.totalAmount} ELSE 0 END), 0)`.mapWith(Number)
const countIf = (condition) => sql`COALESCE(SUM(${condition}), 0)`.mapWith(Number)

// "Total received", "6 received · 1 unpaid" and the Online / Cash cards
const findPaymentSummary = async (salonId, { since }) => {
    const [row] = await db
        .select({
            receivedAmount: amountIf(isPaid),
            receivedCount: countIf(isPaid),
            cashAmount: amountIf(sql`(${isPaid} AND ${isCash})`),
            cashCount: countIf(sql`(${isPaid} AND ${isCash})`),
            unpaidCount: countIf(sql`NOT ${isPaid}`),
        })
        .from(wlBookings)
        .where(paymentsCondition(salonId, since))

    return row
}

// One page of transactions. sortBy: newest (payment date, latest first) / amount (highest first)
const findPayments = async (salonId, { since, sortBy, limit, offset }) =>
    db
        .select({
            bookingId: wlBookings.bookingId,
            firstName: wlBookings.firstName,
            lastName: wlBookings.lastName,
            serviceName: wlBookings.serviceName,
            amount: wlBookings.totalAmount,
            paymentStatus: wlBookings.paymentStatus,
            paymentMode: wlBookings.paymentMode,
            paymentMethod: wlBookings.paymentMethod,
            isCash: sql`${isCash}`.mapWith(Number),
            paidOn: sql`${paidOn}`.mapWith(String),
        })
        .from(wlBookings)
        .where(paymentsCondition(salonId, since))
        .orderBy(
            ...(sortBy === "amount"
                ? [desc(wlBookings.totalAmount), desc(paidOn), desc(wlBookings.bookingId)]
                : [desc(paidOn), desc(wlBookings.bookingId)])
        )
        .limit(limit)
        .offset(offset)

module.exports = { findPaymentSummary, findPayments }
