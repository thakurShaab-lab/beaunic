const { eq, and, or, asc, desc, like, count, sql, inArray, isNotNull } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlEnquiries } = require("../schema/wl-enquiries")
const { wlCustomers } = require("../schema/wl-customers")
const { wlServices } = require("../schema/wl-services")
const { wlEnquiryMessages } = require("../schema/wl-enquiry-messages")

// Active, approved salons with their active services, for the Salon / Service dropdown (one row per salon + service)
const findEnquirySalons = async () =>
    db
        .select({
            salonId: wlCustomers.customerId,
            salonName: wlCustomers.salonName,
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
        })
        .from(wlCustomers)
        .leftJoin(wlServices, and(eq(wlServices.customerId, wlCustomers.customerId), eq(wlServices.status, "1")))
        .where(and(eq(wlCustomers.customerType, "1"), eq(wlCustomers.status, "1"), isNotNull(wlCustomers.salonName)))
        .orderBy(asc(wlCustomers.salonName), asc(wlServices.serviceName))

// Saves the enquiry in wl_enquiries (the same table as website enquiries) and its message as the first chat
// message; returns its ID
const createEnquiry = async (values) =>
    db.transaction(async (tx) => {
        const [result] = await tx.insert(wlEnquiries).values({ ...values, lastMessageDate: values.receiveDate })

        await tx.insert(wlEnquiryMessages).values({
            enquiryId: result.insertId,
            senderType: "customer",
            senderId: values.customerId || 0,
            message: values.message,
            isRead: "0",
            messageAddedDate: values.receiveDate,
        })

        return result.insertId
    })

// ---------------------------------------------------------------------------------------------------------------
// Salon Partner: "Service Enquiries" — the enquiries customers sent to the partner's own salon from the app
// (/api/enquiry/send saves them with inquiry_type "Salon Enquiry" and entity_id = the salon). status 1 = shown.

const SALON_ENQUIRY = "Salon Enquiry"

// The Salon Partner's own enquiries only (not the ones they deleted)
const salonEnquiries = (salonId) =>
    and(
        eq(wlEnquiries.inquiryType, SALON_ENQUIRY),
        eq(wlEnquiries.entityId, salonId),
        eq(wlEnquiries.status, "1"),
        eq(wlEnquiries.salonDeleted, "0")
    )

// The fields of one enquiry, for the list cards and the details screen
const enquiryColumns = {
    enquiryId: wlEnquiries.id,
    firstName: wlEnquiries.firstName,
    lastName: wlEnquiries.lastName,
    email: wlEnquiries.email,
    mobileNumber: wlEnquiries.mobileNumber,
    serviceName: wlEnquiries.requirement,
    entityName: wlEnquiries.entityName,
    message: wlEnquiries.message,
    replyStatus: wlEnquiries.replyStatus,
    receiveDate: wlEnquiries.receiveDate,
    replySubject: wlEnquiries.replySubject,
    replyMessage: wlEnquiries.replyMessage,
    replyDate: wlEnquiries.replyDate,
}

// reply_status: N = New, Y = Replied
const REPLY_STATUSES = { new: "N", replied: "Y" }

const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

// "Search name, email, service": customer's first / last / full name, email or the service asked about
const searchCondition = (search) => {
    if (!search) return undefined
    const pattern = `%${escapeLike(search)}%`
    return or(
        like(wlEnquiries.firstName, pattern),
        like(wlEnquiries.lastName, pattern),
        like(sql`CONCAT_WS(' ', ${wlEnquiries.firstName}, ${wlEnquiries.lastName})`, pattern),
        like(wlEnquiries.email, pattern),
        like(wlEnquiries.requirement, pattern)
    )
}

// One page of the salon's enquiries. status: new / replied / undefined (all). sortBy: newest (default) / oldest.
const findSalonEnquiries = async (salonId, { status, search, sortBy, limit, offset }) =>
    db
        .select(enquiryColumns)
        .from(wlEnquiries)
        .where(
            and(
                salonEnquiries(salonId),
                status ? eq(wlEnquiries.replyStatus, REPLY_STATUSES[status]) : undefined,
                searchCondition(search)
            )
        )
        .orderBy(...(sortBy === "oldest" ? [asc(wlEnquiries.receiveDate), asc(wlEnquiries.id)] : [desc(wlEnquiries.receiveDate), desc(wlEnquiries.id)]))
        .limit(limit)
        .offset(offset)

// Counts for the filter chips (with the same search applied): { total, new, replied }
const countSalonEnquiries = async (salonId, { search }) => {
    const [row] = await db
        .select({
            total: count(),
            new: sql`COALESCE(SUM(${wlEnquiries.replyStatus} = 'N'), 0)`.mapWith(Number),
            replied: sql`COALESCE(SUM(${wlEnquiries.replyStatus} = 'Y'), 0)`.mapWith(Number),
        })
        .from(wlEnquiries)
        .where(and(salonEnquiries(salonId), searchCondition(search)))

    return { total: Number(row.total), new: row.new, replied: row.replied }
}

// The partner's own enquiries with these IDs (any that aren't theirs, or were deleted, are simply missing)
const findSalonEnquiriesByIds = async (salonId, enquiryIds) =>
    db
        .select(enquiryColumns)
        .from(wlEnquiries)
        .where(and(salonEnquiries(salonId), inArray(wlEnquiries.id, enquiryIds)))
        .orderBy(desc(wlEnquiries.receiveDate), desc(wlEnquiries.id))

// Saves the partner's reply on their own enquiries and marks them Replied (reply_status Y).
// The reply is also added to each enquiry's chat. Returns the chat messages saved.
const saveSalonReply = async (salonId, enquiryIds, { subject, message, now }) =>
    db.transaction(async (tx) => {
        await tx
            .update(wlEnquiries)
            .set({ replyStatus: "Y", replySubject: subject, replyMessage: message, replyDate: now, lastMessageDate: now })
            .where(and(salonEnquiries(salonId), inArray(wlEnquiries.id, enquiryIds)))

        const messages = []
        for (const enquiryId of enquiryIds) {
            const values = { enquiryId, senderType: "salon", senderId: salonId, message, isRead: "0", readDate: null, messageAddedDate: now }
            const [result] = await tx.insert(wlEnquiryMessages).values(values)
            messages.push({ messageId: result.insertId, ...values })
        }
        return messages
    })

// Removes the partner's own enquiries from their list (kept in the table for the admin panel)
const deleteSalonEnquiries = async (salonId, enquiryIds, now) => {
    const [result] = await db
        .update(wlEnquiries)
        .set({ salonDeleted: "1", salonDeletedDate: now })
        .where(and(salonEnquiries(salonId), inArray(wlEnquiries.id, enquiryIds)))

    return result.affectedRows
}

module.exports = {
    findEnquirySalons,
    createEnquiry,
    findSalonEnquiries,
    countSalonEnquiries,
    findSalonEnquiriesByIds,
    saveSalonReply,
    deleteSalonEnquiries,
    ENQUIRY_STATUS_KEYS: Object.keys(REPLY_STATUSES),
}
