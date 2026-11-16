const { eq, and, inArray, desc, count, notInArray } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlDisputes } = require("../schema/wl-disputes")
const { wlBookings } = require("../schema/wl-bookings")
const { wlOrders: wlOrder } = require("../schema/wl-order")

// ---- "Related Booking / Order" options: the partner's own bookings and membership orders, newest first ----

const BOOKING_FIELDS = {
    bookingId: wlBookings.bookingId,
    invoiceNumber: wlBookings.invoiceNumber,
    firstName: wlBookings.firstName,
    lastName: wlBookings.lastName,
    serviceName: wlBookings.serviceName,
    slotDate: wlBookings.slotDate,
    totalAmount: wlBookings.totalAmount,
    orderStatus: wlBookings.orderStatus,
    paymentStatus: wlBookings.paymentStatus,
}

// Bookings made at the partner's salon
const findSalonBookings = async (salonId, limit) =>
    db.select(BOOKING_FIELDS).from(wlBookings)
        .where(eq(wlBookings.salonId, salonId))
        .orderBy(desc(wlBookings.bookingId))
        .limit(limit)

const findSalonBooking = async (salonId, bookingId) =>
    (await db.select(BOOKING_FIELDS).from(wlBookings)
        .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.salonId, salonId)))
        .limit(1))[0] || null

const ORDER_FIELDS = {
    orderId: wlOrder.order_id,
    invoiceNumber: wlOrder.invoice_number,
    membershipName: wlOrder.mship_name,
    totalPrice: wlOrder.total_price,
    orderStatus: wlOrder.order_status,
    paymentStatus: wlOrder.payment_status,
    orderDate: wlOrder.receive_date,
}

// The partner's own membership orders (wl_order, order_type 1), deleted ones left out
const partnerOrderCondition = (salonId) =>
    and(eq(wlOrder.customers_id, salonId), eq(wlOrder.order_type, 1), notInArray(wlOrder.order_status, ["Deleted"]))

const findPartnerOrders = async (salonId, limit) =>
    db.select(ORDER_FIELDS).from(wlOrder)
        .where(partnerOrderCondition(salonId))
        .orderBy(desc(wlOrder.order_id))
        .limit(limit)

const findPartnerOrder = async (salonId, orderId) =>
    (await db.select(ORDER_FIELDS).from(wlOrder)
        .where(and(eq(wlOrder.order_id, orderId), partnerOrderCondition(salonId)))
        .limit(1))[0] || null

// ---- Disputes ----

const createDispute = async (values) => {
    const [result] = await db.insert(wlDisputes).values(values)

    return result.insertId
}

// An open dispute (Open / In Review) the partner already has on the same booking or order
const findOpenDisputeFor = async (salonId, relatedType, relatedId) =>
    (await db.select({ disputeId: wlDisputes.disputeId }).from(wlDisputes)
        .where(and(
            eq(wlDisputes.salonId, salonId),
            eq(wlDisputes.relatedType, relatedType),
            eq(wlDisputes.relatedId, relatedId),
            inArray(wlDisputes.status, ["1", "2"])
        ))
        .limit(1))[0] || null

// The partner's disputes, newest first; optional statuses filter and page
const findDisputes = async (salonId, { disputeId, statuses, limit, offset } = {}) => {
    const query = db.select().from(wlDisputes)
        .where(and(
            eq(wlDisputes.salonId, salonId),
            disputeId !== undefined ? eq(wlDisputes.disputeId, disputeId) : undefined,
            statuses?.length ? inArray(wlDisputes.status, statuses) : undefined
        ))
        .orderBy(desc(wlDisputes.disputeId))
        .$dynamic()

    return limit ? query.limit(limit).offset(offset ?? 0) : query
}

const findDispute = async (salonId, disputeId) => (await findDisputes(salonId, { disputeId }))[0] || null

// How many of the partner's disputes are in each status, for the filter counts
const countDisputesByStatus = async (salonId) =>
    db.select({ status: wlDisputes.status, total: count() })
        .from(wlDisputes)
        .where(eq(wlDisputes.salonId, salonId))
        .groupBy(wlDisputes.status)

// The bookings / orders the listed disputes point at, so the card can show "Related: BK-24011"
const findRelatedItems = async (salonId, disputes) => {
    const ids = (type) => [...new Set(disputes.filter((d) => d.relatedType === type && d.relatedId).map((d) => d.relatedId))]
    const bookingIds = ids("booking")
    const orderIds = ids("order")

    const [bookings, orders] = await Promise.all([
        bookingIds.length
            ? db.select(BOOKING_FIELDS).from(wlBookings).where(and(eq(wlBookings.salonId, salonId), inArray(wlBookings.bookingId, bookingIds)))
            : [],
        orderIds.length
            ? db.select(ORDER_FIELDS).from(wlOrder).where(and(eq(wlOrder.customers_id, salonId), inArray(wlOrder.order_id, orderIds)))
            : [],
    ])

    return { bookings, orders }
}

module.exports = {
    findSalonBookings,
    findSalonBooking,
    findPartnerOrders,
    findPartnerOrder,
    createDispute,
    findOpenDisputeFor,
    findDisputes,
    findDispute,
    countDisputesByStatus,
    findRelatedItems,
}
