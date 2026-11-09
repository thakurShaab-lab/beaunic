const { eq, and, inArray, asc, desc, count, max, isNotNull } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlComplaints } = require("../schema/wl-complaints")
const { wlComplaintReplies } = require("../schema/wl-complaint-replies")
const { wlCustomers } = require("../schema/wl-customers")
const { wlBookings } = require("../schema/wl-bookings")

// The User who raised a complaint and the Salon Partner it is against
const raisedBy = alias(wlCustomers, "raised_by")
const salon = alias(wlCustomers, "salon")

// A User sees the complaints they raised; a Salon Partner sees the ones raised against their salon
const viewerCondition = (customer) =>
    customer.customerType === "1"
        ? eq(wlComplaints.salonId, customer.customerId)
        : eq(wlComplaints.customerId, customer.customerId)

// A complaint can be raised against an active Salon Partner
const findActiveSalon = async (salonId) => {
    const rows = await db
        .select({ salonId: wlCustomers.customerId, salonName: wlCustomers.salonName })
        .from(wlCustomers)
        .where(
            and(
                eq(wlCustomers.customerId, salonId),
                eq(wlCustomers.customerType, "1"),
                eq(wlCustomers.status, "1"),
                isNotNull(wlCustomers.salonName)
            )
        )
        .limit(1)

    return rows[0] || null
}

// Complaints are about bookings (wl_bookings); only the customer's own can be attached.
// wl_complaints.order_id holds the booking ID.
const findCustomerOrder = async (customerId, bookingId) => {
    const rows = await db
        .select({ orderId: wlBookings.bookingId, invoiceNumber: wlBookings.invoiceNumber, salonId: wlBookings.salonId })
        .from(wlBookings)
        .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.customerId, customerId)))
        .limit(1)

    return rows[0] || null
}

const createComplaint = async (values) => {
    const [result] = await db.insert(wlComplaints).values(values)

    return result.insertId
}

// The viewer's complaints with both parties' names and the booking details from wl_bookings, newest first.
// Optional filters: complaintId (one complaint) and statuses (list of status values); unset ones are ignored.
const findComplaints = async (customer, { complaintId, statuses } = {}) =>
    db
        .select({
            complaintId: wlComplaints.complaintId,
            customerId: wlComplaints.customerId,
            customerFirstName: raisedBy.firstName,
            customerLastName: raisedBy.lastName,
            salonId: wlComplaints.salonId,
            salonName: salon.salonName,
            orderId: wlComplaints.orderId,
            invoiceNumber: wlBookings.invoiceNumber,
            orderStatus: wlBookings.orderStatus,
            paymentStatus: wlBookings.paymentStatus,
            totalAmount: wlBookings.totalAmount,
            orderReceivedDate: wlBookings.orderReceivedDate,
            serviceName: wlBookings.serviceName,
            complaintSubject: wlComplaints.complaintSubject,
            complaintDescription: wlComplaints.complaintDescription,
            status: wlComplaints.status,
            complaintResolvedDate: wlComplaints.complaintResolvedDate,
            complaintClosedDate: wlComplaints.complaintClosedDate,
            complaintAddedDate: wlComplaints.complaintAddedDate,
            complaintUpdatedDate: wlComplaints.complaintUpdatedDate,
        })
        .from(wlComplaints)
        .leftJoin(raisedBy, eq(raisedBy.customerId, wlComplaints.customerId))
        .leftJoin(salon, eq(salon.customerId, wlComplaints.salonId))
        .leftJoin(wlBookings, eq(wlBookings.bookingId, wlComplaints.orderId))
        .where(
            and(
                viewerCondition(customer),
                complaintId !== undefined ? eq(wlComplaints.complaintId, complaintId) : undefined,
                statuses?.length ? inArray(wlComplaints.status, statuses) : undefined
            )
        )
        .orderBy(desc(wlComplaints.complaintId))

const findComplaint = async (customer, complaintId) => (await findComplaints(customer, { complaintId }))[0] || null

// How many of the viewer's complaints are in each status, for the tab counts
const countComplaintsByStatus = async (customer) =>
    db
        .select({ status: wlComplaints.status, total: count() })
        .from(wlComplaints)
        .where(viewerCondition(customer))
        .groupBy(wlComplaints.status)

// Reply count and latest reply of each complaint, for the list cards
const findReplySummaries = async (complaintIds) => {
    if (!complaintIds.length) return []

    const stats = await db
        .select({
            complaintId: wlComplaintReplies.complaintId,
            replyCount: count(),
            lastReplyId: max(wlComplaintReplies.replyId),
        })
        .from(wlComplaintReplies)
        .where(inArray(wlComplaintReplies.complaintId, complaintIds))
        .groupBy(wlComplaintReplies.complaintId)

    if (!stats.length) return []

    const lastReplies = await db
        .select()
        .from(wlComplaintReplies)
        .where(inArray(wlComplaintReplies.replyId, stats.map((row) => row.lastReplyId)))

    return stats.map((row) => ({
        ...row,
        lastReply: lastReplies.find((reply) => reply.replyId === row.lastReplyId) || null,
    }))
}

// The whole conversation of a complaint, oldest first
const findReplies = async (complaintId) =>
    db
        .select()
        .from(wlComplaintReplies)
        .where(eq(wlComplaintReplies.complaintId, complaintId))
        .orderBy(asc(wlComplaintReplies.replyId))

// Saves a reply and the complaint changes it causes (status, updated date) together
const addReply = async (reply, complaintValues) =>
    db.transaction(async (tx) => {
        const [result] = await tx.insert(wlComplaintReplies).values(reply)

        await tx.update(wlComplaints).set(complaintValues).where(eq(wlComplaints.complaintId, reply.complaintId))

        return result.insertId
    })

const updateComplaint = async (complaintId, values) => {
    await db.update(wlComplaints).set(values).where(eq(wlComplaints.complaintId, complaintId))
}

module.exports = {
    findActiveSalon,
    findCustomerOrder,
    createComplaint,
    findComplaints,
    findComplaint,
    countComplaintsByStatus,
    findReplySummaries,
    findReplies,
    addReply,
    updateComplaint,
}
