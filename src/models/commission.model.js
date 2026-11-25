const { eq, and, desc, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlBookings } = require("../schema/wl-bookings")
const { isBooking } = require("./bookingScope")

// Commission (/api/commission/*): what a Salon Partner owes the admin for their bookings.
// A booking counts when it is a real booking (not an offline draft) at the salon, paid (payment_status Paid), and not
// cancelled - online and offline alike. Its commission % is wl_bookings.commission, set by the admin per booking
// (NULL = not set yet); the amount is total_amount x % / 100. commission_status says whether it was paid to the admin.
// A month's commission invoice (CINV-YYYY-MM) is made of the counted bookings whose service date is in that month.

const b = wlBookings

const counted = (salonId) =>
    and(
        eq(b.salonId, salonId),
        isBooking,
        eq(b.paymentStatus, "Paid"),
        sql`NOT (${b.isCancel} = '1' OR ${b.orderStatus} = 'Cancelled')`
    )

// NULL while the admin hasn't set the %
const commissionAmount = sql`ROUND(${b.totalAmount} * ${b.commission} / 100, 2)`
const isSet = sql`${b.commission} IS NOT NULL`
const isPaid = sql`${b.commissionStatus} = 'paid'`
const monthOf = sql`DATE_FORMAT(${b.slotDate}, '%Y-%m')`

// "50%_off" -> "50\%\_off", so LIKE matches the text literally
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

// Narrowing, all optional:
//   search: "BK-24031" / "24031" (booking ID), or part of the client's name or the service name
//   month: "2026-10" (service date's month); status: 'paid' | 'unpaid' (commission paid to the admin or not)
const filterCondition = ({ search, month, status } = {}) => {
    let searchCondition
    if (search) {
        const id = /^(?:bk-?)?(\d+)$/i.exec(search.replace(/\s+/g, ""))
        const pattern = `%${escapeLike(search)}%`
        searchCondition = sql`(${id ? sql`${b.bookingId} = ${Number(id[1])} OR ` : sql``}CONCAT_WS(' ', ${b.firstName}, ${b.lastName}) LIKE ${pattern} OR ${b.serviceName} LIKE ${pattern})`
    }

    return and(
        searchCondition,
        month ? sql`${monthOf} = ${month}` : undefined,
        status ? eq(b.commissionStatus, status) : undefined
    )
}

const sumOf = (expression) => sql`COALESCE(SUM(${expression}), 0)`.mapWith(Number)

// Totals for the header and the filter chips (the status filter is left out, so every chip keeps its count)
const findCommissionSummary = async (salonId, { search, month } = {}) => {
    const [row] = await db
        .select({
            bookingValue: sumOf(b.totalAmount),
            totalEntries: sql`COUNT(*)`.mapWith(Number),
            configuredEntries: sumOf(isSet),
            paidEntries: sumOf(isPaid),
            unpaidEntries: sumOf(sql`NOT ${isPaid}`),
            totalCommission: sumOf(commissionAmount),
            paidCommission: sumOf(sql`CASE WHEN ${isPaid} THEN ${commissionAmount} END`),
            unpaidCommission: sumOf(sql`CASE WHEN NOT ${isPaid} THEN ${commissionAmount} END`),
        })
        .from(b)
        .where(and(counted(salonId), filterCondition({ search, month })))

    return row
}

const entryColumns = {
    bookingId: b.bookingId,
    customerType: b.customerType,
    firstName: b.firstName,
    lastName: b.lastName,
    serviceName: b.serviceName,
    slotDate: b.slotDate,
    totalAmount: b.totalAmount,
    commission: b.commission,
    commissionAmount: commissionAmount.mapWith((value) => (value === null ? null : Number(value))),
    commissionStatus: b.commissionStatus,
    commissionPaidDate: b.commissionPaidDate,
}

// One page of the salon's commission entries, latest service date first
const findCommissionEntries = async (salonId, filters, { limit, offset }) =>
    db
        .select(entryColumns)
        .from(b)
        .where(and(counted(salonId), filterCondition(filters)))
        .orderBy(desc(b.slotDate), desc(b.bookingId))
        .limit(limit)
        .offset(offset)

// Every entry of one month (an invoice), latest first
const findMonthEntries = async (salonId, month) =>
    db
        .select(entryColumns)
        .from(b)
        .where(and(counted(salonId), sql`${monthOf} = ${month}`))
        .orderBy(desc(b.slotDate), desc(b.bookingId))

// The salon's commission months, latest first, with their totals. The same figures feed Commission Invoices, the
// invoice details and its PDF, so they always agree.
//   year: "2026" (optional)
//   requireSet: only months with at least one commission set (an invoice needs an amount); default true
// paid = every entry of the month has its commission set and paid; otherwise unpaid.
const findCommissionMonths = async (salonId, { year, requireSet = true } = {}) =>
    db
        .select({
            month: monthOf.mapWith(String),
            entries: sql`COUNT(*)`.mapWith(Number),
            configuredEntries: sumOf(isSet),
            paidEntries: sumOf(sql`${isSet} AND ${isPaid}`),
            bookingValue: sumOf(b.totalAmount),
            amount: sumOf(commissionAmount),
            paidDate: sql`MAX(${b.commissionPaidDate})`.mapWith(String),
        })
        .from(b)
        .where(and(counted(salonId), year ? sql`YEAR(${b.slotDate}) = ${Number(year)}` : undefined))
        .groupBy(monthOf)
        .having(requireSet ? sql`SUM(${isSet}) > 0` : undefined)
        .orderBy(desc(monthOf))

module.exports = { findCommissionSummary, findCommissionEntries, findMonthEntries, findCommissionMonths }
