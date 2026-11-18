const { eq, and, lt, gt, asc, desc, count, sql } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlEnquiries } = require("../schema/wl-enquiries")
const { wlEnquiryMessages } = require("../schema/wl-enquiry-messages")
const { wlCustomers } = require("../schema/wl-customers")

const SALON_ENQUIRY = "Salon Enquiry"
const m = wlEnquiryMessages
const salon = alias(wlCustomers, "salon")

// The enquiry a chat belongs to, with the salon's name. Only app salon enquiries that are shown (status 1).
const findChatEnquiry = async (enquiryId) => {
    const rows = await db
        .select({
            enquiryId: wlEnquiries.id,
            salonId: wlEnquiries.entityId,
            customerId: wlEnquiries.customerId,
            firstName: wlEnquiries.firstName,
            lastName: wlEnquiries.lastName,
            email: wlEnquiries.email,
            mobileNumber: wlEnquiries.mobileNumber,
            serviceName: wlEnquiries.requirement,
            replyStatus: wlEnquiries.replyStatus,
            salonDeleted: wlEnquiries.salonDeleted,
            receiveDate: wlEnquiries.receiveDate,
            lastMessageDate: wlEnquiries.lastMessageDate,
            salonName: salon.salonName,
            salonFirstName: salon.firstName,
        })
        .from(wlEnquiries)
        .leftJoin(salon, eq(salon.customerId, wlEnquiries.entityId))
        .where(and(eq(wlEnquiries.id, enquiryId), eq(wlEnquiries.inquiryType, SALON_ENQUIRY), eq(wlEnquiries.status, "1")))
        .limit(1)

    return rows[0] || null
}

// One page of messages, oldest first.
//   afterMessageId: only messages newer than this one (the app checking for new messages)
//   beforeMessageId: older messages than this one (scrolling up)
const findMessages = async (enquiryId, { afterMessageId, beforeMessageId, limit }) => {
    if (afterMessageId) {
        const rows = await db
            .select()
            .from(m)
            .where(and(eq(m.enquiryId, enquiryId), gt(m.messageId, afterMessageId)))
            .orderBy(asc(m.messageId))
            .limit(limit + 1)

        return { messages: rows.slice(0, limit), hasMore: rows.length > limit }
    }

    const rows = await db
        .select()
        .from(m)
        .where(and(eq(m.enquiryId, enquiryId), beforeMessageId ? lt(m.messageId, beforeMessageId) : undefined))
        .orderBy(desc(m.messageId))
        .limit(limit + 1)

    return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit }
}

// The newest of senderType's messages that the other side has read (0 = none), for the read ticks
const findLastReadMessageId = async (enquiryId, senderType) => {
    const [row] = await db
        .select({ id: sql`COALESCE(MAX(${m.messageId}), 0)`.mapWith(Number) })
        .from(m)
        .where(and(eq(m.enquiryId, enquiryId), eq(m.senderType, senderType), eq(m.isRead, "1")))

    return row.id
}

// Saves a message and updates the enquiry: a salon message marks it Replied, a customer message marks it New
// (waiting for the salon). Returns the saved row.
const addMessage = async ({ enquiryId, senderType, senderId, message, now }) =>
    db.transaction(async (tx) => {
        const [result] = await tx.insert(m).values({
            enquiryId,
            senderType,
            senderId,
            message,
            isRead: "0",
            messageAddedDate: now,
        })

        await tx
            .update(wlEnquiries)
            .set({ lastMessageDate: now, replyStatus: senderType === "salon" ? "Y" : "N" })
            .where(eq(wlEnquiries.id, enquiryId))

        return { messageId: result.insertId, enquiryId, senderType, senderId, message, isRead: "0", readDate: null, messageAddedDate: now }
    })

// Marks the other side's messages as read. senderType: whose messages were read. Returns how many changed.
const markRead = async (enquiryId, senderType, now) => {
    const [result] = await db
        .update(m)
        .set({ isRead: "1", readDate: now })
        .where(and(eq(m.enquiryId, enquiryId), eq(m.senderType, senderType), eq(m.isRead, "0")))

    return result.affectedRows
}

// ---------------------------------------------------------------------------------------------------------------
// User: "My Enquiries", the enquiries they sent from the app, latest activity first

const customerEnquiries = (customerId) =>
    and(eq(wlEnquiries.customerId, customerId), eq(wlEnquiries.inquiryType, SALON_ENQUIRY), eq(wlEnquiries.status, "1"))

const findCustomerEnquiries = async (customerId, { limit, offset }) =>
    db
        .select({
            enquiryId: wlEnquiries.id,
            salonId: wlEnquiries.entityId,
            salonName: salon.salonName,
            serviceName: wlEnquiries.requirement,
            replyStatus: wlEnquiries.replyStatus,
            salonDeleted: wlEnquiries.salonDeleted,
            receiveDate: wlEnquiries.receiveDate,
            lastMessageDate: wlEnquiries.lastMessageDate,
            lastMessage: sql`(SELECT ${m.message} FROM ${m} WHERE ${m.enquiryId} = ${wlEnquiries.id} ORDER BY ${m.messageId} DESC LIMIT 1)`,
            lastSenderType: sql`(SELECT ${m.senderType} FROM ${m} WHERE ${m.enquiryId} = ${wlEnquiries.id} ORDER BY ${m.messageId} DESC LIMIT 1)`,
            unreadCount: sql`(SELECT COUNT(*) FROM ${m} WHERE ${m.enquiryId} = ${wlEnquiries.id} AND ${m.senderType} = 'salon' AND ${m.isRead} = '0')`.mapWith(Number),
        })
        .from(wlEnquiries)
        .leftJoin(salon, eq(salon.customerId, wlEnquiries.entityId))
        .where(customerEnquiries(customerId))
        .orderBy(desc(sql`COALESCE(${wlEnquiries.lastMessageDate}, ${wlEnquiries.receiveDate})`), desc(wlEnquiries.id))
        .limit(limit)
        .offset(offset)

const countCustomerEnquiries = async (customerId) => {
    const [row] = await db.select({ total: count() }).from(wlEnquiries).where(customerEnquiries(customerId))
    return Number(row.total)
}

module.exports = {
    findChatEnquiry,
    findMessages,
    findLastReadMessageId,
    addMessage,
    markRead,
    findCustomerEnquiries,
    countCustomerEnquiries,
}
